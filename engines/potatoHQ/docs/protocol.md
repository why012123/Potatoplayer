# potatoHQ 控制协议(JSON-RPC over stdio)

传输与 Potatoplayer Super 的 `RpcServer.java` **完全一致**:每行一个 JSON 对象,stdin 收请求,stdout 发响应/事件。

```
请求   {"id":1,"method":"playback.play","params":{"path":"/x.flac"}}
响应   {"id":1,"result":{...}}
错误   {"id":1,"error":{"code":"BackendError","message":"..."}}
事件   {"event":"playback.time","data":{...}}
```

`id` 可以是任意 JSON 值;事件没有 `id`。stdout 只用于协议,日志走 stderr。

启动后先发一条:

```json
{"event":"backend.ready","data":{"engine":"potatoHQ","version":"1.0.0","protocol":"super-compatible"}}
```

## 方法

### 播放(Super 兼容)

| 方法 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `playback.play` | `path`(必填)、`trackId?`、`startAt?`/`startSeconds?`、`volume?`、`nextPath?`、`nextTrackId?` | `state` | 打开文件并开始播放;`nextPath` 预置下一首做无缝衔接 |
| `playback.pause` | — | `state` | 暂停(输出静音,不解码推进) |
| `playback.resume` | — | `state` | 恢复 |
| `playback.setNext` | `path`、`trackId?` | `{"queued":bool}` | 播放中追加/替换下一首(gapless) |
| `playback.toggle` | — | `state` | 暂停/恢复切换(Super 的 `playback.toggle`) |
| `playback.stop` | — | `state` | 停止并关闭设备 |
| `playback.seek` | `seconds` | `state` | 重新打开并定位(有短暂中断) |
| `playback.volume` | `volume`(0–1) | `state` | 软件音量 |
| `playback.state` | — | `state` | 当前状态快照 |

`state` 字段(兼容 Super 的 `PlaybackController.state()` 子集):

```json
{"active":true,"playing":true,"paused":false,"finished":false,
 "position":12.5,"duration":368.0,
 "sourceRate":44100,"outputRate":48000,"sourceChannels":2,
 "bufferedFrames":88200,"decodedFrames":1048576,"volume":0.7,
 "path":"/x.flac","trackId":"t1","device":"MacBook Air扬声器","hog":true,
 "format":"float32 48000 Hz 2 ch (hog)","underruns":0,"callbacks":1234}
```

### 引擎

| 方法 | 参数 | 返回 |
|---|---|---|
| `engine.devices` | — | `{"devices":[{"id","name","channels","sampleRate","isDefault"}]}` |
| `engine.capabilities` | — | `{"engine","version","upsampling","sdm","dop","exclusive","dsdRates","pcmMaxRate"}` |
| `engine.status` | — | 同 `state` |
| `engine.setOutput` | `deviceId`(空=默认)、`exclusive`(bool) | 确认;下次 `playback.play` 生效 |
| `engine.setUpsampling` | `tapsPerPhase`(16–512) | 确认;下次 `playback.play` 生效 |
| `engine.setEq` | `bands:[{freq,gain,q?}]`、`preamp`(dB) | `{"applied":n,"live":bool}`;播放中实时生效(46 ms 交叉淡化) |
| `engine.setVolume` | `volume` | `state` |
| `engine.shutdown` | — | 停止并退出守护进程 |
| `ping` | — | `{"pong":true}` |

## 事件

| 事件 | data | 触发 |
|---|---|---|
| `playback.track` | `{"trackId","path","gapless"?}` | `playback.play` 成功,或 gapless 边界被渲染线程跨过 |
| `playback.state` | `state` | 播放态变化(play/pause/stop/seek/finished) |
| `playback.time` | `{"time","duration","playing"}` | 播放中每 500 ms |
| `playback.finished` | `{"reason":"eof"}` | 环形排空且解码 EOF |
| `toast` | `{"kind":"error","message"}` | 非致命提示 |

## 示例会话

```bash
$ ./build/potatohq rpc
{"event":"backend.ready","data":{"engine":"potatoHQ","version":"1.0.0","protocol":"super-compatible"}}
{"id":1,"method":"engine.setOutput","params":{"deviceId":"BuiltInSpeakerDevice","exclusive":true}}
{"id":1,"result":{"accepted":true,"deviceId":"BuiltInSpeakerDevice","exclusive":true,"note":"applies on next playback.play"}}
{"id":2,"method":"engine.setUpsampling","params":{"tapsPerPhase":128}}
{"id":2,"result":{"tapsPerPhase":128}}
{"id":3,"method":"playback.play","params":{"path":"/music/a.flac","trackId":"t1"}}
{"id":3,"result":{"active":true,"playing":true,...}}
{"event":"playback.track","data":{"trackId":"t1","path":"/music/a.flac"}}
{"event":"playback.time","data":{"time":0.5,"duration":368.0,"playing":true}}
...
{"event":"playback.finished","data":{"reason":"eof"}}
```

## 兼容性说明

- `playback.play` 的 `queue` 参数被接受但忽略:队列归 Super 的 `PlaybackController`,引擎只负责单曲播放。
- `playback.next/previous`、`playback.repeat/shuffle` 等**不在引擎侧实现**——它们本来就是 Super 的队列逻辑。
- 响应里没有 Super 的 `queue/queueIndex/repeat/shuffle`,适配层可以补默认值,或让 Super 的 `PlaybackController` 继续持有这些字段。
