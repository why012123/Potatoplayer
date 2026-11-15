package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A draggable EQ curve stored as sorted control points over a log-frequency axis.
 *
 * <p>The curve is the single source of truth: every engine samples it at its own
 * resolution instead of sharing a fixed ten-slot gain array. potatoHQ can apply
 * arbitrary peaking bands, libVLC exposes a fixed ten-band equalizer and mpv gets
 * the ten-band cascade it always had — so a drawn curve sounds the same everywhere
 * instead of silently meaning different frequencies per engine.</p>
 *
 * <p>Gains are interpolated with a monotone cubic (Fritsch–Carlson) so a drawn
 * curve never overshoots between two control points.</p>
 */
public final class EqCurve {
    public static final int MIN_POINTS = 2;
    public static final int MAX_POINTS = 32;
    public static final float MIN_FREQ = 20f;
    public static final float MAX_FREQ = 20000f;
    /** potatoHQ resolution: 31 log-spaced bands from 20 Hz to 20 kHz. */
    public static final float[] HQ_FREQS = logFrequencies(MIN_FREQ, MAX_FREQ, 31);
    /** Q that turns 1/3-octave spacing into a smooth drawn curve. */
    public static final double HQ_Q = 4.3;

    public record Point(float freq, float gain) {
    }

    private final List<Point> points;
    private final double[] xs;
    private final double[] ys;
    private final double[] tangents;

    private EqCurve(List<Point> ordered) {
        this.points = List.copyOf(ordered);
        int n = this.points.size();
        xs = new double[n];
        ys = new double[n];
        for (int i = 0; i < n; i++) {
            xs[i] = Math.log10(this.points.get(i).freq());
            ys[i] = this.points.get(i).gain();
        }
        tangents = monotoneTangents(xs, ys);
    }

    public static EqCurve flat() {
        return new EqCurve(List.of(new Point(MIN_FREQ, 0f), new Point(MAX_FREQ, 0f)));
    }

    public static EqCurve of(List<Point> raw) {
        return new EqCurve(ordered(raw));
    }

    /** Interpret a legacy ten-slot gain array at the given band frequencies. */
    public static EqCurve fromBands(float[] bands, List<Float> freqs) {
        List<Point> raw = new ArrayList<>();
        int n = Math.min(bands == null ? 0 : bands.length, freqs == null ? 0 : freqs.size());
        for (int i = 0; i < n; i++) raw.add(new Point(freqs.get(i), bands[i]));
        return new EqCurve(ordered(raw));
    }

    /** Accepts either a bare array or an object with a {@code points} array. */
    public static EqCurve parse(JsonNode node) {
        JsonNode array = node;
        if (node != null && node.isObject()) array = node.get("points");
        List<Point> raw = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode item : array) {
                float freq = (float) item.path("freq").asDouble(MIN_FREQ);
                float gain = (float) item.path("gain").asDouble(0);
                raw.add(new Point(freq, gain));
            }
        }
        return new EqCurve(ordered(raw));
    }

    public List<Point> points() {
        return points;
    }

    /** Copy of this curve with the point at {@code freq} replaced (or added). */
    public EqCurve withPoint(float freq, float gain) {
        float target = clampFreq(freq);
        List<Point> next = new ArrayList<>(points);
        for (int i = 0; i < next.size(); i++) {
            if (Math.abs(next.get(i).freq() - target) <= Math.max(0.5f, target * 0.002f)) {
                next.set(i, new Point(next.get(i).freq(), EqPreset.clamp(gain)));
                return new EqCurve(ordered(next));
            }
        }
        next.add(new Point(target, EqPreset.clamp(gain)));
        return new EqCurve(ordered(next));
    }

    /** Gain of the drawn curve at one frequency (monotone cubic in log-f). */
    public float gainAt(float freq) {
        double x = Math.log10(clampFreq(freq));
        int n = xs.length;
        if (x <= xs[0]) return (float) ys[0];
        if (x >= xs[n - 1]) return (float) ys[n - 1];
        int i = 0;
        while (i < n - 2 && x > xs[i + 1]) i++;
        double h = xs[i + 1] - xs[i];
        if (h <= 0) return (float) ys[i];
        double t = (x - xs[i]) / h;
        double t2 = t * t;
        double t3 = t2 * t;
        double h00 = 2 * t3 - 3 * t2 + 1;
        double h10 = t3 - 2 * t2 + t;
        double h01 = -2 * t3 + 3 * t2;
        double h11 = t3 - t2;
        double value = h00 * ys[i] + h10 * h * tangents[i] + h01 * ys[i + 1] + h11 * h * tangents[i + 1];
        return EqPreset.clamp((float) value);
    }

    public float[] sample(float[] freqs) {
        float[] out = new float[freqs == null ? 0 : freqs.length];
        for (int i = 0; i < out.length; i++) out[i] = gainAt(freqs[i]);
        return out;
    }

    public float[] sample(List<Float> freqs) {
        return sample(toArray(freqs));
    }

    public float[] legacyBands() {
        return sample(EqPreset.DEFAULT_FREQS);
    }

    public List<Map<String, Object>> toPointList() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Point point : points) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("freq", point.freq());
            item.put("gain", point.gain());
            out.add(item);
        }
        return out;
    }

    public void writeTo(ObjectNode node) {
        ArrayNode array = node.putArray("points");
        for (Point point : points) {
            ObjectNode item = array.addObject();
            item.put("freq", point.freq());
            item.put("gain", point.gain());
        }
    }

    /** Flat curve sampled at the same frequencies, e.g. for an "all zero" preview. */
    public static float[] toArray(List<Float> freqs) {
        if (freqs == null) return new float[0];
        float[] out = new float[freqs.size()];
        for (int i = 0; i < out.length; i++) {
            Float value = freqs.get(i);
            out[i] = value == null ? 0f : value;
        }
        return out;
    }

    static float clampFreq(float freq) {
        if (Float.isNaN(freq) || Float.isInfinite(freq)) return MIN_FREQ;
        return Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
    }

    static float[] logFrequencies(float low, float high, int count) {
        float[] out = new float[count];
        double ratio = high / low;
        for (int i = 0; i < count; i++) {
            out[i] = (float) (low * Math.pow(ratio, (double) i / (count - 1)));
        }
        return out;
    }

    private static List<Point> ordered(List<Point> raw) {
        List<Point> filtered = new ArrayList<>();
        if (raw != null) {
            for (Point point : raw) {
                if (point != null) filtered.add(new Point(clampFreq(point.freq()), EqPreset.clamp(point.gain())));
            }
        }
        filtered.sort(Comparator.comparingDouble(Point::freq));
        List<Point> merged = new ArrayList<>();
        for (Point point : filtered) {
            if (!merged.isEmpty() && Math.abs(merged.get(merged.size() - 1).freq() - point.freq()) <= 0.5f) {
                merged.set(merged.size() - 1, point);
            } else {
                merged.add(point);
            }
        }
        if (merged.size() > MAX_POINTS) merged = downsample(merged);
        if (merged.isEmpty()) return List.of(new Point(MIN_FREQ, 0f), new Point(MAX_FREQ, 0f));
        if (merged.size() == 1) {
            float gain = merged.get(0).gain();
            return List.of(new Point(MIN_FREQ, gain), new Point(MAX_FREQ, gain));
        }
        return merged;
    }

    private static List<Point> downsample(List<Point> points) {
        List<Point> out = new ArrayList<>(MAX_POINTS);
        int n = points.size();
        for (int i = 0; i < MAX_POINTS; i++) {
            int index = (int) Math.round((double) i * (n - 1) / (MAX_POINTS - 1));
            out.add(points.get(index));
        }
        return out;
    }

    /** Fritsch–Carlson monotone tangents: C1 smooth without overshoot. */
    private static double[] monotoneTangents(double[] xs, double[] ys) {
        int n = xs.length;
        double[] tangents = new double[n];
        if (n < 2) return tangents;
        double[] slopes = new double[n - 1];
        for (int i = 0; i < n - 1; i++) {
            double dx = xs[i + 1] - xs[i];
            slopes[i] = dx <= 0 ? 0 : (ys[i + 1] - ys[i]) / dx;
        }
        tangents[0] = slopes[0];
        tangents[n - 1] = slopes[n - 2];
        for (int i = 1; i < n - 1; i++) {
            if (slopes[i - 1] * slopes[i] <= 0) tangents[i] = 0;
            else tangents[i] = (slopes[i - 1] + slopes[i]) / 2.0;
        }
        for (int i = 0; i < n - 1; i++) {
            if (slopes[i] == 0) {
                tangents[i] = 0;
                tangents[i + 1] = 0;
                continue;
            }
            double a = tangents[i] / slopes[i];
            double b = tangents[i + 1] / slopes[i];
            double sum = a * a + b * b;
            if (sum > 9) {
                double scale = 3 / Math.sqrt(sum);
                tangents[i] = scale * a * slopes[i];
                tangents[i + 1] = scale * b * slopes[i];
            }
        }
        return tangents;
    }
}
