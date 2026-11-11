# potatoHQ Changelog

## Unreleased — 2026-11-01

### Fixed

- **potatoHQ 音频链路修正**：正确检查 CoreAudio 采样率是否可写，修复源采样率跟随与恢复路径；设备不支持时仍按实际速率重采样。
- **多声道转立体声保留声道内容**：按声道布局混入中置、环绕及 LFE，归一化混音矩阵避免相干信号叠加过载；单声道保持等增益复制，普通双声道保持直通。
- **曲尾音效一致**：重采样器排出的尾音经过完整 EQ、交叉馈电和空间处理；跳转后清理声场与交叉馈电历史，PCM 解码复用输出缓冲区，减少分块内存分配。

### Validation

- 新增离线播放输出捕获测试：16/24-bit PCM 逐样本解码、单声道等增益、5.1 全声道混音及余量、同率直通与完整重采样尾音处理。
- 新增模拟 CoreAudio 设备测试：采样率切换、恢复、只读设备、查询失败与写入失败；不操作真实音频设备。
- PCM 仍使用 float32 输出；DSD 仍为 PCM → ΣΔ 转换。跨采样率无缝衔接继续保持设备速率以避免重开输出造成断音，不宣称硬件端 bit-perfect。

## 1.1.0 — 2026-10-28

### Added

- 采样率跟随源：设备支持时切到源采样率，退出恢复原速率；`devices` 输出支持速率列表。
- 空间声场 `SpatialPanner`：ILD（等功率、归一化）、ITD（0–0.6 ms，Hermite 分数延迟）、
  后方 3.5 kHz/−6 dB 高架、距离衰减；关闭时逐样本直通。
- 交叉馈电 `CrossfeedProcessor`：0.3 ms 延迟 + 700 Hz 低通 + 强度映射，电平归一化；透传可验证。
- 频谱 tap `SpectrumAnalyzer`：渲染线程定长拷贝，控制线程 2048 点 FFT、48 段对数频段、起音/释放平滑。
- RPC：`engine.setSpatial`、`engine.setCrossfeed`、`engine.setVisualization`、`engine.setExclusive`、
  `engine.setFollowRate`；`playback.state` 增加 `spatial` / `crossfeed`。
- EQ 自动 headroom：测量 10 段级联峰值，preamp 压到峰值 ≤ 0 dBFS。
- 设备速率恢复、`--no-sandbox` 下的 UI 回归脚本（外部使用）。

### Changed

- 升频器内层循环改为线性历史 + 块处理（无取模、无分支），10 s 音频 705.6k 从 1.2 s 降到 0.70 s，
  DSD64 从 4.6 s 降到 2.4 s；质量指标不变（镜像 −101.1 dB、通带 0.0314 dB）。
- 默认关闭 Hog 独占；`seek` 改为原地重定位并保留暂停状态。
- 默认音量 0.7 → 0.3（命令行与引擎默认），避免测试时过响。

### Fixed

- ΣΔ 反馈符号（`err = decision − quantized` 下必须用 `F = 1 − H`），此前会锁死成全 0/全 1。
- 升频器块内历史被覆盖导致幅度 −2.6 dB。
- 暂停/结尾排空误计欠载。
- EQ 改参重置 IIR 状态导致爆音 → 双 bank 交叉淡化。
- make 增加头文件依赖，修复增量构建崩溃。

### Measurements

见 `docs/measurements.md`：升频、ΣΔ（DSD64 7 阶 106.5 dB）、抖动、DoP、空间声场、交叉馈电、频谱。
