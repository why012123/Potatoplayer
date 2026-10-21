package com.potato.player.core;

import javafx.scene.image.Image;
import javafx.scene.image.PixelReader;
import javafx.scene.image.PixelFormat;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 桌宠素材（迷迭香）：读取烘焙好的 PNG 帧序列。
 *
 * <p>帧不是 Gif/视频，而是一段段目录（{@code relax/000.png …}），
 * 每段一个动作、一个固定帧率 —— 这是<b>离线烘焙</b>出来的：明日方舟基建模型是
 * Spine 3.5.51，Java 侧没有现成运行时，用官方 canvas 运行时逐帧渲染成带 alpha 的 PNG，
 * 播放时只需要按帧率换图（CPU 占用极低，也不会像视频那样吃内存解码）。</p>
 *
 * <p>素材本身版权归鹰角网络，<b>不进公开仓库</b>：默认放在工程目录的
 * {@code pets/rosmontis/}（.gitignore 已排除），可用 {@code -Dpotato.petDir=...}
 * 或配置项 {@code pet_dir} 指向别处；烘焙脚本见 {@code tools/bake-pet.mjs}。</p>
 */
public final class PetAssets {

    /** 认得的动作（与烘焙脚本一致）。 */
    public static final String CLIP_IDLE = "relax";
    public static final String CLIP_MOVE = "move";
    public static final String CLIP_INTERACT = "interact";
    public static final String CLIP_SIT = "sit";
    public static final String CLIP_SLEEP = "sleep";
    public static final List<String> CLIP_ORDER =
            List.of(CLIP_IDLE, CLIP_MOVE, CLIP_INTERACT, CLIP_SIT, CLIP_SLEEP);

    /** 一段动作：帧序列 + 帧率 + 内容包围盒（用来把「脚底」对齐到桌面）。 */
    public static final class Clip {
        private final String name;
        private final int fps;
        private final List<Image> frames;
        private final int width;
        private final int height;
        /** 内容（不透明像素）最下沿 / 图高，0~1。 */
        private final double contentBottom;
        /** 内容水平中点 / 图宽，0~1（镜像后要用 1-x）。 */
        private final double contentCenterX;

        Clip(String name, int fps, List<Image> frames, double contentBottom, double contentCenterX) {
            this.name = name;
            this.fps = Math.max(1, fps);
            this.frames = frames;
            this.width = (int) Math.round(frames.get(0).getWidth());
            this.height = (int) Math.round(frames.get(0).getHeight());
            this.contentBottom = contentBottom;
            this.contentCenterX = contentCenterX;
        }

        public String name() {
            return name;
        }

        public int fps() {
            return fps;
        }

        public int frameCount() {
            return frames.size();
        }

        public int width() {
            return width;
        }

        public int height() {
            return height;
        }

        public double durationMs() {
            return frames.size() * 1000.0 / fps;
        }

        public double contentBottom() {
            return contentBottom;
        }

        public double contentCenterX() {
            return contentCenterX;
        }

        /** 按时间取帧（自动取模循环）。 */
        public Image frameAt(double phaseMs) {
            double loop = durationMs();
            double p = loop > 0 ? phaseMs % loop : 0;
            if (p < 0) {
                p += loop;
            }
            int index = (int) Math.floor(p / (1000.0 / fps));
            if (index < 0) {
                index = 0;
            }
            if (index >= frames.size()) {
                index = frames.size() - 1;
            }
            return frames.get(index);
        }

        /** 一帧都不动（静态姿势）时用它。 */
        public Image lastFrame() {
            return frames.get(frames.size() - 1);
        }
    }

    private PetAssets() {
    }

    /** 素材目录：{@code -Dpotato.petDir} → 配置 {@code pet_dir} → 工程目录下 {@code pets/rosmontis}。 */
    public static File resolveDir(Map<String, Object> config, String charId) {
        String override = System.getProperty("potato.petDir");
        if (override != null && !override.isBlank()) {
            return new File(override);
        }
        if (config != null) {
            String configured = Config.getString(config, "pet_dir", "");
            if (!configured.isBlank()) {
                return new File(configured);
            }
        }
        File project = new File(System.getProperty("user.dir"));
        return new File(project, "pets" + File.separator + charId);
    }

    /** 目录里有没有可用的帧（有 meta.json 且有至少一个动作目录）。 */
    public static boolean available(File dir) {
        if (dir == null || !dir.isDirectory()) {
            return false;
        }
        if (!new File(dir, "meta.json").isFile()) {
            return false;
        }
        for (String clip : CLIP_ORDER) {
            File sub = new File(dir, clip);
            if (sub.isDirectory() && sub.listFiles((d, n) -> n.toLowerCase().endsWith(".png")) != null) {
                return true;
            }
        }
        return false;
    }

    /**
     * 逐个动作加载（按 {@link #CLIP_ORDER} 顺序），每加载好一段就回调一次。
     *
     * <p>调用方应在<b>后台线程</b>里跑：205 帧 PNG 解码约 1~2 秒，不能卡界面。</p>
     */
    public static Map<String, Clip> load(File dir, ClipReady onReady) throws IOException {
        Map<String, Clip> clips = new LinkedHashMap<>();
        if (!available(dir)) {
            return clips;
        }
        Map<String, Integer> fps = readFps(dir);
        for (String name : CLIP_ORDER) {
            File sub = new File(dir, name);
            if (!sub.isDirectory()) {
                continue;
            }
            String[] pngs = sub.list((d, n) -> n.toLowerCase().endsWith(".png"));
            if (pngs == null || pngs.length == 0) {
                continue;
            }
            Arrays.sort(pngs);
            List<Image> frames = new ArrayList<>(pngs.length);
            int[] bbox = {Integer.MAX_VALUE, -1, Integer.MAX_VALUE, -1};
            for (String png : pngs) {
                Image img = new Image(new File(sub, png).toURI().toString(), false);
                if (img.isError() || img.getWidth() <= 0) {
                    continue;
                }
                frames.add(img);
                updateContentBox(img, bbox);
            }
            if (frames.isEmpty()) {
                continue;
            }
            int w = (int) Math.round(frames.get(0).getWidth());
            int h = (int) Math.round(frames.get(0).getHeight());
            double bottom = bbox[1] >= 0 && h > 0 ? (bbox[1] + 1.0) / h : 1.0;
            double centerX = bbox[2] >= 0 && bbox[3] >= 0 && w > 0
                    ? ((bbox[2] + bbox[3] + 1) / 2.0) / w
                    : 0.5;
            Clip clip = new Clip(name, fps.getOrDefault(name, 12), frames, bottom, centerX);
            clips.put(name, clip);
            if (onReady != null) {
                onReady.onClip(clip);
            }
        }
        return clips;
    }

    /** 每段动作的帧率来自 meta.json；读不到就用 12fps 兜底。 */
    private static Map<String, Integer> readFps(File dir) {
        Map<String, Integer> out = new LinkedHashMap<>();
        File meta = new File(dir, "meta.json");
        if (!meta.isFile()) {
            return out;
        }
        try {
            String text = Files.readString(meta.toPath());
            // 轻量解析：只找 "clips" 里每段的 "fps"，不引 Jackson 也能用
            com.fasterxml.jackson.databind.JsonNode root =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(text);
            com.fasterxml.jackson.databind.JsonNode clips = root.path("clips");
            clips.fieldNames().forEachRemaining(name -> {
                int fps = clips.path(name).path("fps").asInt(12);
                if (fps > 0) {
                    out.put(name, fps);
                }
            });
        } catch (Exception ignored) {
            // meta.json 坏了就用默认帧率
        }
        return out;
    }

    /** 统计一帧的不透明像素包围盒（和 GIF 那条路同一套规则；逐帧取并集）。 */
    private static void updateContentBox(Image img, int[] bbox) {
        int w = (int) Math.round(img.getWidth());
        int h = (int) Math.round(img.getHeight());
        if (w <= 0 || h <= 0) {
            return;
        }
        int[] px = new int[w * h];
        PixelReader reader = img.getPixelReader();
        if (reader == null) {
            return;
        }
        reader.getPixels(0, 0, w, h, PixelFormat.getIntArgbInstance(), px, 0, w);
        AnimatedGif.updateContentBox(bbox, px, w, h);
    }

    /** 每段动作加载好的回调。 */
    public interface ClipReady {
        void onClip(Clip clip);
    }
}
