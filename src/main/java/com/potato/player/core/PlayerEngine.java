package com.potato.player.core;

import uk.co.caprica.vlcj.factory.MediaPlayerFactory;
import uk.co.caprica.vlcj.media.Media;
import uk.co.caprica.vlcj.player.base.Equalizer;
import uk.co.caprica.vlcj.player.base.MediaPlayer;
import uk.co.caprica.vlcj.player.base.MediaPlayerEventAdapter;

import java.util.List;

/**
 * VLC 播放引擎封装（对应 backend.py 的 Player，使用 VLCJ）。
 */
public class PlayerEngine {

    public interface Listener {
        void onFinished();
    }

    private final MediaPlayerFactory factory;
    private final MediaPlayer mediaPlayer;
    /** VLC 均衡器描述体（复用同一个实例；改增益会经 EqualizerListener 实时回写 libvlc）。 */
    private final Equalizer vlcEq;
    private boolean eqOn = false;
    private int volume;
    private volatile Listener listener;

    public PlayerEngine(int volume) {
        // 在 macOS 上自动发现系统安装的 VLC（/Applications/VLC.app）
        boolean discovered = new uk.co.caprica.vlcj.factory.discovery.NativeDiscovery().discover();
        if (!discovered) {
            // 兜底：显式指定 libvlc 所在目录
            System.setProperty("jna.library.path", "/Applications/VLC.app/Contents/MacOS/lib");
        }
        this.factory = new MediaPlayerFactory();
        this.mediaPlayer = factory.mediaPlayers().newMediaPlayer();
        setVolume(volume);

        // 均衡器描述体只建一次；极旧的 libvlc 缺少相关符号时静默降级
        Equalizer eq = null;
        try {
            eq = factory.equalizer().newEqualizer();
        } catch (Exception | LinkageError ignored) {
            eq = null;
        }
        this.vlcEq = eq;

        mediaPlayer.events().addMediaPlayerEventListener(new MediaPlayerEventAdapter() {
            @Override
            public void finished(MediaPlayer mediaPlayer) {
                Listener l = listener;
                if (l != null) {
                    l.onFinished();
                }
            }
        });
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public void play(String filepath) {
        mediaPlayer.controls().stop();
        mediaPlayer.media().play(filepath);
    }

    public void pause() {
        mediaPlayer.controls().pause();
    }

    public void resume() {
        mediaPlayer.controls().play();
    }

    public void stop() {
        mediaPlayer.controls().stop();
    }

    public void setVolume(int volume) {
        this.volume = Math.max(0, Math.min(150, volume));
        mediaPlayer.audio().setVolume(this.volume);
    }

    public int getVolume() {
        return volume;
    }

    public void seek(double seconds) {
        mediaPlayer.controls().setTime((long) (seconds * 1000));
    }

    /** 当前播放时间（秒），无则返回 null。 */
    public Double getTime() {
        long ms = mediaPlayer.status().time();
        return ms >= 0 ? ms / 1000.0 : null;
    }

    public boolean isPlaying() {
        return mediaPlayer.status().isPlaying();
    }

    /** 获取音频时长（秒），通过 VLC 解析；失败返回 0。 */
    public int getDuration(String filepath) {
        try {
            Media media = factory.media().newMedia(filepath);
            media.parsing().parse();
            long dur = media.info().duration();
            media.release();
            return dur > 0 ? (int) (dur / 1000) : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    // ── 均衡器 ──

    /** 均衡器是否可用（libvlc 是否提供相关 API）。 */
    public boolean eqAvailable() {
        return vlcEq != null;
    }

    /** VLC 均衡器的频段中心频率（Hz）。 */
    public List<Float> eqBandFrequencies() {
        try {
            return factory.equalizer().bands();
        } catch (Exception e) {
            return List.of();
        }
    }

    /** VLC 内置（工厂）预设名。 */
    public List<String> eqFactoryPresetNames() {
        try {
            return factory.equalizer().presets();
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * 读取 VLC 内置预设。
     *
     * <p><b>前级原样保留</b>：VLC 预设表里的前级值就是该预设设计的补偿值
     * （Flat 为 12 dB ＝中性），不能"防削波"式地压低，否则整体会小声。</p>
     */
    public EqPreset eqFactoryPreset(String name) {
        if (vlcEq == null || name == null) {
            return null;
        }
        try {
            Equalizer e = factory.equalizer().newEqualizer(name);
            EqPreset p = new EqPreset();
            int n = Math.min(EqPreset.BANDS, e.bandCount());
            for (int i = 0; i < n; i++) {
                p.setBand(i, e.amp(i));
            }
            p.setPreamp(e.preamp());
            return p;
        } catch (Exception e) {
            return null;
        }
    }

    /** 均衡器当前是否启用。 */
    public boolean isEqOn() {
        return eqOn;
    }

    /**
     * 应用均衡器参数；{@code on=false} 或 {@code preset=null} 即旁路。
     *
     * <p>在 {@code play()} 之前调用时只写媒体播放器级变量，新建的音频输出会继承它，
     * 因此换曲切预设不会有重建滤波链的断点；播放中调用则实时改写每段增益。</p>
     */
    public void applyEq(EqPreset preset, boolean on) {
        if (vlcEq == null) {
            return;
        }
        eqOn = on && preset != null;
        if (preset != null) {
            int n = Math.min(EqPreset.BANDS, vlcEq.bandCount());
            for (int i = 0; i < n; i++) {
                float v = preset.band(i);
                if (Math.abs(vlcEq.amp(i) - v) > 0.0001f) {
                    vlcEq.setAmp(i, v);
                }
            }
            if (Math.abs(vlcEq.preamp() - preset.preamp()) > 0.0001f) {
                vlcEq.setPreamp(preset.preamp());
            }
        }
        mediaPlayer.audio().setEqualizer(eqOn ? vlcEq : null);
    }

    public void release() {
        try {
            mediaPlayer.release();
        } catch (Exception ignored) {
        }
        try {
            factory.release();
        } catch (Exception ignored) {
        }
    }
}
