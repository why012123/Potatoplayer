# potatoHQ 架构

## 1. 模块与依赖方向

```
main.cpp ──► rpc.cpp ──► engine.cpp ──► out/coreaudio_out.cpp
                  │            │
                  │            ├──► decode/ffmpeg_decoder.cpp
                  │            ├──► dsp/resampler.cpp ──► dsp/filters.cpp
                  │            └──► dsp/eq.cpp
                  └──► json.cpp

离线路由:main.cpp ──► (decode → resampler → dither) ──► io/wav.cpp
                     └► (decode → resampler → sdm → dop/dsf) ──► io/dsf.cpp
```

没有反向依赖:引擎不知道 RPC,解码器不知道引擎。`json` 只被控制面使用,不进音频线程。

## 2. 线程模型

| 线程 | 职责 | 实时性 |
|---|---|---|
| 主线程 | CLI / RPC 读取 stdin | 否 |
| RPC ticker | 500 ms 轮询,发 `playback.time` / `playback.finished` | 否 |
| 解码线程(每流一个) | FFmpeg 读帧 → 声道映射 → 升频 → EQ → 写入环形 | 否(可被抢占) |
| CoreAudio 回调 | 从环形读 → 音量斜坡 → 填缓冲 | **是** |

音频回调里只做:环形读(memcpy)、音量乘、欠载补零。无锁、无分配、无日志、无系统调用。

## 3. 数据格式与精度

- 解码输出 float32 交织;升频/调制内部 double。
- 环形缓冲:交错 float32,容量 2 s × 输出采样率(48 kHz 时约 96k 帧)。
- 音量在回调里做线性斜坡(每 callback 从上次增益过渡到目标),避免滑块 zipper。

## 4. 升频器

有理数比 `fs_out/fs_in = L/M` 精确约分。原型滤波器长 `n = tapsPerPhase × max(L, M)`:

- 插值时滤波器跑在 `L·fs_in`,零插值衰减 1/L → 系数整体乘 L 保持单位增益;
- 抽取时滤波器跑在 `fs_in`,必须按 M 加长,否则过渡带会宽到混叠;
- 每个相位预展开成连续 `phaseTaps_[p][j]`,内层循环连续访存;
- 流式状态:**线性历史缓冲**(前 `taps` 帧 + 本块),整块写入后一次性产出;内层循环无取模、无边界分支。
- 为什么是单级而不是半带级联:带边锐度要求过渡带极窄(25 kHz 处 −121 dB),级联每级相对过渡更宽,
  同等阻带下 MAC 更多;实测数据见 `measurements.md` 4.4。
- 群延迟:`latencyOutputFrames = (taps/2)·L/M`,离线转换会丢弃这段并 flush 尾部。

## 5. ΣΔ 调制器

误差反馈 + 解析 NTF:

```
H(z) = ((1 − z⁻¹)/(1 − r·z⁻¹))^N,  r = 2/g^(1/N) − 1
F(z) = 1 − H(z) = (D − N)/D,  以 IIR 形式实现: fb = Σ num·e − Σ den·fb
```

实现要点(全部来自实测调参,见 `docs/measurements.md`):

- 代码里 `err = decision − quantized`(**负的量化误差**),所以必须用 `F = 1 − H` 才能得到 NTF = H;符号写反会直接锁死成全 0/全 1。
- `outOfBandGain` 是稳定性的唯一旋钮:5 阶 2.0 稳定(101 dB),2.2 崩;7 阶 1.8 稳定(107 dB),2.0 崩。
- 稳定性熔断:`|fb| > 4` 清状态并计数;`decision` 钳到 ±stabilityLimit。
- idle-lock:输入连续 50 ms 低于 1e-7 时输出 DSD 静音字节 `0x69` 并冻结状态,防止极限环;输入超过 2e-6 恢复。
- 输出 LSB-first 打包(DSF 原生位序);DoP 需要 16-bit 组,由 `DopPacker` 重新分组并加 marker。

## 6. CoreAudio 输出

两种客户端格式:PCM = float32;DoP = 24-in-32(`kAudioFormatFlagIsSignedInteger`,24 有效位),
载波率由 DSD 倍率决定(DSD64→176400,DSD128→352800)。打开前会查
`kAudioDevicePropertyAvailableNominalSampleRates`,支持才切 `kAudioDevicePropertyNominalSampleRate`,
切完回读确认;不支持就直接失败,不静默降到 PCM。

- `AudioComponentInstanceNew(HALOutput)` → 启用输出 bus 0、关闭输入 bus 1 → 绑定 `CurrentDevice`
- 客户端格式固定 float32 interleaved(`kAudioFormatFlagIsFloat|IsPacked`),`mBytesPerFrame = 4·ch`
- `kAudioUnitProperty_SetRenderCallback` 拉模式;`kAudioUnitProperty_MaximumFramesPerSlice` 4096
- Hog Mode:`kAudioDevicePropertyHogMode` 写 `getpid()`,再回读 owner 校验;关闭时写 −1
- 采样率:DoP 会主动切到载波率并回读确认;PCM 只跟随设备当前速率
- 欠载:回调拿到的帧数不足时补零,`underruns` 计数在 `engine.status` 里上报

## 6.1 Gapless 交接

```
解码线程:  [A 解码] --EOF--> flush 升频尾巴 --> 记录 boundary=framesDecoded --> 打开 B --> [B 解码]
渲染线程:  [A 播放] ..... framesRendered 跨过 boundary --> advancePending
控制线程:  收到 advancePending --> 换 path/duration、positionOffset=boundary --> emit playback.track
```

- 交接发生在**解码侧**,不是渲染侧:环形缓冲有 2 s 余量,打开下一首的几十毫秒被缓冲吸收。
- `flush` 是必须的,否则 A 的 FIR 尾巴丢失,接缝处会有可闻的断点。
- B 允许不同采样率/声道数:每段重建自己的升频器与 EQ,输出统一到设备率。
- 位置:新曲 position = framesRendered − boundary,UI 不会看到跳到 5.27/5.00 这种越界值(已钳制)。
- 结尾排空(`decoderEof_`)不再算欠载,否则每首歌结束都会误报一次。

## 6.2 EQ 无爆音切换

`ChannelEq` 持有两个 bank(current / next)。参数变化时:

1. 控制线程写 `eqBands_` 并 `++eqRevision_`;
2. 解码线程在下一个 chunk 边界看到 revision 变化,`setTarget()` 用新参数建 next bank(零状态);
3. 接下来的 2048 帧(≈46 ms)两套 bank 并行,输出线性交叉淡化;
4. 淡化结束 `current_ = move(next_)` —— 新 bank 的状态已经被这段信号"预热"过,所以之后是连续的。

旁路也建模成 identity bank,所以"开启/关闭 EQ"同样是淡入淡出而不是跳变。
EQ 挂在输出率上、跨 gapless 段保持状态,所以连播时滤波状态不重置。

## 6.3 采样率跟随源

PCM 播放前先查设备能力(`kAudioDevicePropertyAvailableNominalSampleRates`):源采样率受支持时
把设备切到该速率,不再由引擎重采样(96k FLAC 在支持 96k 的设备上就是 96k 输出)。切换前记录
原速率,`close()` 时恢复,避免把系统设成别的速率后不还原。设备不支持则回落到当前速率。

## 6.4 空间声场(2D 声像)

`SpatialPanner`:输入 `(x, y) ∈ [-1,1]²`(右/前为正),四象限拖拽。

- **ILD**:等功率 pan,归一化到近耳 = 1.0、中心 = 1.0(开关时不改变响度);
- **ITD**:远耳延迟最多 0.6 ms,用 **Hermite 分数延迟**而不是整数样本,避免相位台阶;
- **前后**:后半圈叠一个 3.5 kHz、−6 dB 的高架,按 `-y` 混合;
- **距离**:半径 → 最多 −6.8 dB 衰减。

参数每样本一阶平滑(20 ms);关闭时**严格直通**(单测逐样本比对)。渲染在 EQ 之后、音量之前
的解码线程里完成,不进音频回调。

## 6.4b 交叉馈电(crossfeed)

`CrossfeedProcessor`:对侧声道 → 0.3 ms 延迟 → 700 Hz 二阶低通 → 按强度混入本耳,
整体除以 `1+g` 保持电平。`outL = (inL + g·LP(delay(inR)))/(1+g)`。
关闭或强度 0 时逐样本直通(单测覆盖)。它排在 EQ 之后、空间声场之前。

## 6.5 频谱 tap

渲染回调只做一件事:把 mono 混音写进 8192 样本的无锁环(固定数组,无分配)。
RPC 线程以 50 ms 周期快照 2048 点、Hann 窗、2048 点 FFT,聚合成 48 个对数频段,
以 `engine.spectrum {bars:[0..1]}` 事件推送;起音快、释放慢,避免抖动。
禁用时不采样、不计算。该 tap 只读输出缓冲,不影响音频数据。

## 7. 已知取舍

| 取舍 | 原因 | 后续 |
|---|---|---|
| 实时 DoP 未在真机验证 | 本机无 176.4k+ 设备 | 需 DoP DAC |
| Gapless 仅 PCM | DoP 换曲要重建调制器与载波相位 | 后续做 DSD 段间衔接 |
| 单级升频 | 实现简单、指标够;16x 实时约 8× 实时余量 | 加半带级联可再省 2-4 倍算力 |
| EQ 改参重置状态 | 未做系数插值 | 双滤波器交叉淡化 |
