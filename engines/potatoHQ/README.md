# potatoHQ

**一个从零自研的 macOS 原生音频引擎**:FFmpeg 解码 → 多相 FIR 升频 → 抖动/噪声整形 → ΣΔ 调制 → CoreAudio 输出,
并提供一个与 **Potatoplayer Super** 源码语义贴合的 JSON-RPC 守护进程,供日后做"引擎切换"。

> 位置:`Potatoplayer Super/engines/potatoHQ`。源码、测试和文档随 Super 仓库分发;
> 构建产物(`build/`)和本地测试素材(`work/`)不入库。
> 接入方式见 [`docs/super-integration.md`](docs/super-integration.md)。

---

## 1. 它做了什么

```
                  ┌──────────────┐   ┌─────────────┐   ┌──────────┐   ┌───────────┐
  FLAC/MP3/... →  │ FfmpegDecoder│ → │ Polyphase   │ → │ ChannelEq│ → │  Dither   │ → WAV
  WAV/AIFF/ALAC   │  (float32)   │   │ Resampler   │   │ (10-band)│   │ (TPDF/NS) │
                  └──────────────┘   └─────────────┘   └──────────┘   └───────────┘
                                            │
                                            ├──────────────→ CoreAudio (Hog 可选) → DAC
                                            │
                                            └→ SdmModulator (1-bit) → DSF / DoP 打包
```

- **解码**:libavformat/libavcodec 全格式;内部 float32,原生采样率。
- **升频**:有理数多相 FIR(L/M 精确约分),Kaiser 窗设计,`tapsPerPhase` 可调(64/128/192)。
- **EQ**:10 段 RBJ peaking(与 Super 的 VLC 10 段频点一致:31.25…16 kHz)+ preamp;
  参数可**播放中实时修改**,双滤波器组 46 ms 交叉淡化,不重置 IIR 状态、不爆音。
- **抖动**:TPDF / Highpass TPDF / 二阶噪声整形,量化到目标整数格点。
- **ΣΔ 调制**:误差反馈拓扑,NTF 解析设计 `H(z)=((1-z⁻¹)/(1-r z⁻¹))^N`,3/5/7 阶,带 idle-lock、稳定性熔断、增益斜坡。
- **DSD 封装**:Sony DSF(SONY 原生 1-bit,planar block)与 dCS DoP v1.1(24-bit 载波、0x05/0xFA 交替)。
- **输出**:CoreAudio AUHAL;PCM 走 float32,DoP 走 24-in-32 整数;Hog Mode 独占;设备枚举;
  采样率协商(DoP 会把设备切到 176.4/352.8 kHz 载波率)。
- **Gapless**:A 段 EOF 时先 flush 升频尾巴,再打开下一首继续写同一个环形缓冲;换曲由
  "输出帧边界"触发,设备全程不关不重开。可在播放中通过 `playback.setNext` 追加下一首。
- **控制面**:newline-delimited JSON-RPC over stdio,方法与事件与 Super 的 `RpcServer`/`PlaybackController` 对齐。

## 2. 快速开始

```bash
cd engines/potatoHQ
make            # 构建 build/potatohq 与 build/phq_tests
make run-tests  # DSP 单元测试 + 音质测量

./build/potatohq devices
./build/potatohq info "/path/to/track.flac"

# 44.1k → 705.6k / 24-bit,TPDF 抖动
./build/potatohq convert --in work/sample.flac --out work/out_705k.wav \
    --rate 705600 --bits 24 --taps 128

# 生成 DSD64(7 阶调制器)
./build/potatohq dsd --in work/sample.flac --out work/out_dsd64.dsf --dsd 64 --order 7

# 实时播放(默认设备;--no-exclusive 关闭 Hog)
./build/potatohq play work/sample.flac --seconds 10

# 守护进程(给 Super 用)
./build/potatohq rpc
```

依赖:macOS + Xcode CLT;FFmpeg(Homebrew,`/opt/homebrew`);无需 CMake/ninja。

## 3. 实测指标(本机,`make run-tests`)

| 项目 | 结果 | 说明 |
|---|---|---|
| 升频通带误差 | **−0.0012 dB** @1 kHz | 44.1k→705.6k,K=128 |
| 升频镜像抑制 | **−101.1 dB** @43.1 kHz | 同上 |
| 通带平坦度 | **0.0314 dB**(20 Hz–20 kHz 最差) | 同上 |
| SDM 带内 SNR(DSD64) | 3 阶 **80.9 dB** / 5 阶 **101.2 dB** / 7 阶 **106.5 dB** | 20 Hz–20 kHz,−3 dB 输入 |
| TPDF 16-bit | RMS **−96.3 dBFS**,均值 ~1e−8,**整数格点精确** | 无信号输入 |
| EQ 实时切换 | 淡入最大样本跳变 **0.0260**(纯正弦导数 0.0262),+6 dB 响应 0.1995 | 无台阶 |
| DoP 字节布局 | 通过 | `[later][earlier][marker]`,marker 0x05/0xFA 按载波帧交替 |
| DSF 结构 | 通过(ffprobe 识别为 `dsd_lsbf_planar`) | 4096 B/ch block |
| 离线转换速度 | 10 s 44.1k→705.6k:1.2 s;→DSD64:4.6 s | M 系列,单线程 |

> 详细方法与原始输出见 [`docs/measurements.md`](docs/measurements.md)。

## 4. 当前边界(诚实清单)

- **实时 DoP 已实现但本机无法真机验证**:需要 DAC 接受 176.4 kHz(DSD64)/352.8 kHz(DSD128)的
  24-bit 整数载波。本机只有蓝牙(44.1k)与内置扬声器,两者都会被明确拒绝(`DoP: device does not support 176400 Hz`);
  离线 DoP 载波 WAV 已通过逐帧 marker 校验。
- 设备采样率跟随设备当前 nominal rate;不会主动把设备切到更高率(留作 P2)。
- Gapless 只覆盖 PCM 路径;DoP 换曲仍会重开设备(DSD 需要重建调制器状态)。
- 无 crossfade / 网络流;队列仍由上层(Super)负责(引擎只接受 `nextPath` 提示)。
- EQ 交叉淡化期间两套滤波器并行,CPU 短暂翻倍(46 ms),可忽略。
- 升频是**单级多相**(刻意):实测 2× 半带级联在同等阻带下更费算力,见 `docs/measurements.md` 4.4。
  DSD64 生成约 4.2× 实时;更高倍率或更高阻带要求需要 SIMD/多线程。
- `tapsPerPhase` 越大越慢;实时 16x 升频建议 ≤128。

## 5. 目录

```
potatoHQ/
├── Makefile
├── src/
│   ├── audio.h            基础类型 + 无锁 SPSC 环形缓冲
│   ├── json.{h,cpp}       无依赖 JSON
│   ├── engine.{h,cpp}     实时播放引擎(线程/环形/状态)
│   ├── rpc.{h,cpp}        JSON-RPC 守护进程
│   ├── main.cpp           CLI
│   ├── decode/            FFmpeg 解码
│   ├── dsp/               滤波器/升频/抖动/SDM/DoP/EQ
│   ├── io/                WAV / DSF 读写
│   └── out/               CoreAudio AUHAL
├── tests/test_dsp.cpp     单元测试 + 测量(FFT、SNR、DoP、抖动)
├── docs/                  架构 / 协议 / Super 接入 / 测量
├── work/                  测试素材与产物(运行后生成)
└── build/                 构建产物
```

## 6. 与 Potatoplayer Super 的关系

Super 现在的播放内核是 `PlaybackEngine.java`(VLCJ),队列/自动切歌在 `PlaybackController.java`。
potatoHQ 提供**同一语义**的 RPC 子集,所以切换引擎时只需替换 `PlaybackEngine` 的实现(约 120 行 Java 客户端),
其余 Super 代码不动。见 [`docs/super-integration.md`](docs/super-integration.md)。
