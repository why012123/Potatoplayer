# Potatoplayer Super

**一个从旧 Potatoplayer Java 版重构而来的 Electron 桌面音乐播放器。**  
保留 Java + VLCJ 的播放与扫描内核，彻底重做 UI、动效和信息架构。  
块、流派和网易云是这个版本的核心，而不是附属设置。

> 当前版本：`s1.4.12` · 运行平台：macOS（主力验证）；Windows / Linux 代码路径已保留但未真机验证。
> 完整更新记录（含旧 Java 2.1.19 / Python 1.x 历史）见 [`CHANGELOG.md`](CHANGELOG.md)。

**快速启动：macOS 双击 [`start.command`](start.command)；或终端运行 `./start.sh`。**

![Home](docs/screenshots/home.jpg)

## 目录

- [为什么是 Super](#为什么是-super)
- [界面](#界面)
- [核心功能](#核心功能)
- [块 / 流派系统](#块--流派系统)
- [网易云](#网易云)
- [运行](#运行)
- [网易云服务](#网易云服务)
- [数据与迁移](#数据与迁移)
- [快捷键](#快捷键)
- [架构](#架构)
- [开发与测试](#开发与测试)
- [已知限制](#已知限制)
- [致谢](#致谢)

## 为什么是 Super

旧版是一个功能非常完整的 JavaFX 应用，但界面把大量能力塞进了三栏面板，且动效受 JavaFX 布局方式限制。Super 的目标不是“换个配色”，而是重新组织产品：

- **新渲染层**：Electron + React + TypeScript + Framer Motion。
- **保留可靠内核**：扫描、元数据、VLC 播放和歌词逻辑改为无头 Java 服务。
- **全新信息架构**：资料库 → 内容画布 → 常驻 Now Playing，播放控制集中在右侧，避免底部播放条和侧栏重复。
- **视觉系统**：保留原有暖色毛玻璃“经典视图”，并提供纸张质感的“编辑纸感”新版视图；浅/深色、强调色、标题字体、圆角、密度和背景氛围都可独立调节。全局使用统一圆角层级（26 / 22 / 16 / 12 / 10 px），不再由各个组件随手决定。
- **双语界面**：全应用中 / 英即时切换，默认沿用现有版本的英文界面，不强迫迁移。
- **动效系统**：共享导航指示器、页面弹簧转场、封面交叉淡入、悬浮抬升、正在播放均衡器、下载进度、命令面板。
- **核心业务优先**：块 / 流派 / 网易云都获得独立页面、管理和批量操作，而不是藏在设置里。

## 界面

| Classic view (default) | Editorial view |
| --- | --- |
| ![Classic home](docs/screenshots/classic-home.jpg) | ![Editorial home](docs/screenshots/home.jpg) |

| 中文界面 | Appearance studio |
| --- | --- |
| ![Chinese home](docs/screenshots/zh-home.jpg) | ![Appearance](docs/screenshots/appearance.jpg) |

| Songs | Blocks & Genres |
| --- | --- |
| ![Songs](docs/screenshots/songs.jpg) | ![Blocks and Genres](docs/screenshots/collections.jpg) |

| Song editor | Right panel collapsed |
| --- | --- |
| ![Song editor](docs/screenshots/editor.jpg) | ![Expanded layout](docs/screenshots/editor-solo.jpg) |

| Immersive · framed lyrics | Immersive · bare lyrics |
| --- | --- |
| ![Immersive playback](docs/screenshots/immersive.jpg) | ![Immersive without lyrics frame](docs/screenshots/immersive-no-frame.jpg) |

![Dark room](docs/screenshots/dark-home.jpg)

![Dark settings and appearance picker](docs/screenshots/dark-settings.jpg)

![Equalizer](docs/screenshots/eq.jpg)

![Bilibili MV search](docs/screenshots/bilibili-mv.jpg)

| Discover (NetEase) | Tag detail |
| --- | --- |
| ![Discover](docs/screenshots/discover.jpg) | ![Tag detail](docs/screenshots/tag.jpg) |

<p align="center">
  <img src="docs/screenshots/manager.jpg" width="720" alt="Blocks and genres manager" />
</p>

## 核心功能

### 外观与语言

设置（右上角头像或侧栏 Settings）里有一个完整的 **Appearance Studio**：

- **两套视图预设**
  - **经典视图 / Classic**：沿用当前版本的暖色 iOS 毛玻璃、胶囊按钮、粉色日光背景、全宽 Now Playing 封面和无衬线标题。升级后默认使用它。
  - **新版视图 / Editorial**：暖纸表面、New York / 宋体类衬线标题、分组的工具栏、紧凑播放栏和更克制的按钮层级。
- **精确微调**
  - 强调色：跟随封面，或固定为珊瑚、鼠尾草、海蓝、梅子、琥珀。
  - 标题字体：衬线 / 无衬线。
  - 圆角：柔和 / 利落。
  - 密度：舒展 / 紧凑。
  - 背景氛围：浓郁 / 安静。
  - 实时预览小窗，一键恢复默认风格。
- **浅色 / 深色**：顶栏太阳 / 月亮按钮或设置中的两张卡片；浅色是暖纸与日光玻璃，深色是暖炭与低光玻璃，而不是简单反色。
- **语言**：设置顶部可即时切换 **English / 中文**。导航、页面标题、按钮、空态、弹窗、EQ、Bilibili、下载面板、命令面板、无障碍标签、日期问候和长时长格式都会一起切换。默认英文，选择会持久化。
- 所有选择保存在 `localStorage`（`potato:appearance:v1` 与 `potato:theme`），在首次绘制前应用，刷新和重启后保持。
- 沉浸播放和 3D 舞台保持电影感深色；切回浅色后恢复日光玻璃。
- 沉浸歌词可以完全无框，也可以单独调节模块填充、描边、模糊、圆角、行距与当前行高亮；无框不再残留底色、描边或阴影。
- potatoHQ 动态频谱也已进入沉浸模式（经典视图的进度条上方、3D 舞台底部 HUD），可在沉浸自定义中开关并调节高度与存在感。

### 本地资料库

- 递归扫描 `mp3 / flac / m4a / aac / ogg / opus / wav / aiff`。
- Jaudiotagger 读取标题、歌手、专辑、流派、年份、时长和内嵌封面。
- 自动识别旧资料库的 `ratings.json`、`metadata_cache.csv`、`blocks.json`、
  `genres.json` 和封面缓存；**只读**，不回写旧文件。
- 专辑、歌手集合、单曲列表、收藏、自定义歌单和全局搜索。
- 会话恢复：上次歌曲、进度、音量、循环 / 随机状态，以及窗口偏好。

### 播放

- VLCJ 4.12.1 / libVLC；支持播放、暂停、上一首、下一首、停止、拖拽 seek、
  音量、静音、随机、循环全部 / 单曲、队列。
- 上一首会先回到歌曲开头，再退到上一首（3.5 秒阈值）。
- 播放状态由命令、VLC 错误回调和 finished 事件共同决定，避免 libVLC 启动瞬间误判。
- 右侧 Now Playing 面板始终可见：大封面、进度、控制、音量、歌词 / 队列。
- 折叠后变成毛玻璃 Mini Player，仍可播放、暂停和打开面板；**页面内容同时自动铺满整个右侧空间，不再留下空白列**。
- **沉浸模式**：点击右侧正在播放歌曲的封面进入全窗口播放页；点击大封面（或按 `Esc`）退出。窗口里只剩封面、歌词、进度、播放控制与环境背景。
- 沉浸模式的 **Customize** 是一个默认隐藏的右侧侧栏，不会加遮罩；拖动滑块时，背后的封面、歌词与配色会实时预览。
- **动态频谱**：切换到 potatoHQ 后，48 段实时频谱可加入经典沉浸和 3D 舞台；自定义面板可单独开关、调节高度和存在感，VLC / mpv 下会说明其不可用。
- **3D 演出 v2**：逐字描边→实心跟唱、灵魂残影、13 种镜头调度、按镜头生成的 3D 点阵舞台、Bloom 后期和 potatoHQ 音频驱动；舞台设置可分别控制粒子、镜头、阵列、逐字辉光和音频响应。
- 自定义里可以单独关闭 **歌词框 / Lyrics frame**：保留歌词的字号、对齐、翻译与当前行高亮，只去掉周围的玻璃框，得到更开阔的画面。

### 聆听统计

侧栏「统计」页把每次实际播放进度记录在本地 `stats.json`（按日期、小时、曲目），提供：

- GitHub 贡献图式年度热力图，可在 **时长 / 次数** 之间切换；颜色按当年活跃日的分位数分级，
  点击任意一天查看当天时长、播放次数和高峰时段；
- 总聆听时长、播放次数、活跃天数、当前连续与最长连续，以及日均聆听；
- 24 小时聆听时钟，深夜 / 早晨 / 下午 / 夜晚占比，和由时段推导的「聆听人格」；
- 全部时间内最常听的歌曲与艺术家，可点击直接播放或进入艺术家页；
- 按年份切换，最早一天会标注为统计起点。

统计从本版本开始记录；旧版资料库只有播放次数，没有时间戳，因此不会被伪造成历史时段。
所有数据只写在本机，没有账号、云同步或上报。

### 首页自定义

首页右上角「自定义」可显示 / 隐藏、上移 / 下移六个模块（精选唱片、资料库概览、区块与流派、
最近添加、反复聆听、常听艺术家），并切换舒展 / 紧凑密度。配置存于 `potato:home:v1`，
随时可一键恢复默认。

### 歌曲编辑

- 独立 **Song editor** 页面，从侧边栏、顶栏铅笔按钮、歌曲 `···` 菜单或 `⌘E` 进入。
- 左侧是可搜索、可按块 / 流派过滤的歌曲浏览器；右侧是当前歌曲的编辑面板。
- 可编辑：**Block、Genre、0–10 评分、个人笔记、收藏**。
- 笔记最多 2000 字，保存到 `library.json`，不修改音频文件标签。
- 切换歌曲前会自动保存未提交修改；也提供手动 **Save changes / Discard**。
- Previous / Next 可在全库中顺序编辑；列表会自动滚动到当前歌曲。
- 编辑结果会保留在重扫和旧资料库迁移之后。
- 编辑页提供 **Delete song**：确认后从资料库、收藏、歌单和播放队列中移除；位于资料库内的音频文件会移到 `~/.potatoplayer-super/trash/`，仍可手动恢复。

### 均衡器

- **完整还原旧版 Java 的 EQ 模型**：10 段（31 Hz – 16 kHz），每段 ±20 dB、0.5 dB 步进；
  前级 12 dB 才是中性 / unity，界面以相对值 `0.0 dB` 显示。
- 三类状态同时存在：**全局预设**、**命名预设**、**单曲预设**。单曲预设优先于全局；
  匹配时先按相对 `PotatoLibrary` 的路径，失败再按网易云 ID 兜底。
- 旧版 `PotatoLibrary/source/eq.json`（`version: 2` 格式、`global` / `presets` / `songs`）
  会在首次启动时与新版数据合并一次：保留已有曲线，导入 `Dance改` 等命名预设与全部单曲预设；
  之后删除的旧预设不会被重新导入。
  旧版 v1 的相对前级会一次性迁移 12 dB，新版自身的数据不会被重复加 12 dB。
- 入口：右侧正在播放栏的滑杆按钮，或沉浸页右下角。编辑时立即试听草稿；切歌或关闭
  对话框会丢弃未保存草稿并恢复已保存曲线。
- 可保存到 **本曲 / 全局 / 新命名预设**；支持 VLC 18 个内置预设、Bypass、Flat、Reset、
  删除命名预设。播放某首歌前会自动应用它的单曲预设。
- 数据以 v2 格式保存在 `~/.potatoplayer-super/eq.json`；旧版文件只读导入，不回写。

### 跨启动保留

- 自建歌单会立即写入 `library.json`，重启后仍在。
- 当前播放队列、队列顺序、当前歌曲和播放位置会保存；下次启动恢复同一队列，不再默认变回全库顺序。
- 删除歌曲时也会同步从队列和所有歌单中清理，避免留下失效 ID。

### 歌词与动效

- LRC 解析，支持一行多时间戳与翻译文件（`.trans.lrc` / `.zh.lrc`）。
- 当前行平滑滚动、点击 seek、原文 + 译文双行显示。
- 封面变化时交叉淡入环境背景；环境色从封面主色中提取。
- 页面转场、共享导航 pill、列表悬浮、播放按钮 morph、Toast、下载进度条。
- 设置里可以开启“减少动态效果”。

## 块 / 流派系统

这两个维度现在是资料库的主干：

- **Blocks** 描述歌曲属于哪个“架子” / 分类。
- **Genres** 描述歌曲的声音类型。
- 两者都有独立名称、颜色、数量、平均评分和总时长。
- 旧播放器的 `block` 与 `genre` 字段、颜色定义在首次扫描时导入。
- **Collections 页面**：彩色标签卡、Taste Profile（按平均评分排序，未评分歌曲不计入）。
- **Tag 详情页**：封面式标签头图、统计、播放 / 随机、完整歌曲表。
- **Songs 页面**：块 / 流派双筛选 + 数据表中的独立列 + 彩色 pill。
- **批量归类**：Select → 勾选歌曲 → Assign block / Assign genre；可以输入新名称直接创建标签。
- **批量队列与歌单**：同一多选栏支持 **Play next / Add to queue / Add to playlist**，顺序保持不变。
- **整张专辑进队列**：专辑、歌手、块 / 流派、歌单和收藏页都提供 Play next、Add to queue 与
  Add to playlist，不再只能用整张专辑替换当前队列。
- **单曲编辑**：任意歌曲的 `···` → **Edit in song editor**，或使用侧栏 **Editor**、顶栏铅笔、`⌘E`，在完整编辑页修改块、流派、评分、个人笔记和收藏。
- **完整管理器**：创建、改名、改色、删除；删除只清除标签，不删除文件。
- 用户修改在重扫后保留；已删除的旧标签不会因为再次读取旧资料库而复活。

> 新版不会回写旧版 `ratings.json`。数据迁移只发生一次，之后以
> `~/.potatoplayer-super/library.json` 为准。

## 网易云

Discover 页面：

- 本地 `api-enhanced` 服务状态检测，并会在进入 Discover 时尝试自动启动。
- **二维码登录**：显示网易云返回的二维码，App 扫码后自动保存 cookie。
- **Cookie 登录**：粘贴 `MUSIC_U` 即可。
- 首次启动会读取旧 Potato Player 的 `.cookie`，所以已有登录状态可以无缝继承。
- 搜索歌曲、每日推荐、我的歌单和歌单详情。
- 支持 Standard / High 320k / Lossless 三档音质。
- 下载到当前资料库，自动：
  - 下载音频；
  - 下载封面；
  - 写入 `.lrc` 与 `.trans.lrc`；
  - 记录 `netease_bindings.json`（保证封面和专辑信息在重扫后仍挂在文件上）；
  - 触发资料库重新索引。
- 下载进度进入全局 Download Tray；单首和歌单“Download all”都会显示。
- 渲染层拿不到 cookie；所有网易云请求都在 Java 服务里完成。

> 登录、搜索、下载都需要本地 `api-enhanced` 服务。没有它时，本地播放和其它功能完全正常。

## QQ 音乐

Discover 页面左侧 Online 分组里的 **NETEASE / QQ MUSIC** 小徽章可以直接点击切换在线源。

QQ 源使用本地 [qq-music-api](https://github.com/yakult-green-tea/qq-music-api)（Koa2 + TypeScript，MIT）：

- 二维码登录（QQ 音乐 App）
- 歌曲搜索 / 新歌推荐 / 推荐歌单
- QQ 音乐歌曲下载（Standard / High 320k / Lossless，实际取决于账号与音源）
- 下载后自动保存封面、`.lrc` / `.trans.lrc`，并触发资料库重扫

安装本地服务：

```bash
npm run setup:qq-api
```

它会把第三方服务安装到 `~/.potatoplayer-super/api/qq-music-api`。也可以在 Discover 的服务状态卡片里看到服务地址与启动状态。

> QQ Music API 是独立第三方项目，不随本仓库分发。需要 Node.js 20+。

## B站 MV

播放栏顶部的场记板按钮，或任意歌曲的 `···` → **Find MV on Bilibili**，会打开 MV 搜索：

- 自动用「歌曲标题 + 歌手 + MV」作为关键词，也可以手动修改。
- 直接调用 Bilibili 公开视频搜索，不需要登录、Cookie 或本地 API 服务。
- 展示最多 20 条结果：封面、时长、UP 主、分区、播放量和发布日期。
- 点击结果会在系统浏览器打开 `bilibili.com/video/BV…`，不下载视频，也不改动音乐资料库。
- 相同关键词缓存 3 分钟；遇到 Bilibili 风控或网络错误时提供重试和“Search on Bilibili”兜底。
- Electron 主进程只允许打开 `bilibili.com` / `b23.tv` 的 HTTPS 链接。

> 这是“找 MV”而不是内嵌播放器：视频在浏览器中观看，避免和本地 VLC 音频输出打架。

## 运行

### 环境

- macOS 12+（主力验证环境）
- JDK 21+
- Node.js 22+ / npm 10+
- VLC（`/Applications/VLC.app`）
- 可选：[api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)（网易云功能；使用已安装的 Node 运行）

### 一键启动

- **macOS**：双击 [`start.command`](start.command)。
- **macOS / Linux 终端**：`./start.sh`
- **Windows**：双击 [`start.bat`](start.bat)。

脚本会自动：

1. 检查 Node.js 22+、JDK 21+ 和 VLC；
2. 首次运行时安装 npm 依赖；
3. 构建 React 渲染层；
4. 检查 Java 音频服务；缺失或源码更新时自动编译；
5. 启动 Electron。

macOS 双击 `.command` 时会打开一个 Terminal 窗口显示日志；关掉窗口或 `Ctrl+C` 即可退出。

### 手动启动

```bash
cd /path/to/potatomusic

npm install
npm start
```

`npm start` 也会执行构建检查。首次 `npm install` 会下载 Electron
运行时（约 110MB）；网络较慢时可以为 npm 配置镜像。

### 开发模式

```bash
npm run dev
```

- Vite + React HMR；
- Electron 主进程 / Java 服务修改后需要重启 `npm run dev`；
- 生产构建：`npm run build:renderer`。

### 手动构建

```bash
npm run build:backend
npm run build:renderer
npm start
```

后端构建脚本会从本地 Maven 缓存或 Maven Central 取得精确版本的依赖；
如果本机没有 Maven，也会自动下载 jar 到 `backend/.deps/`（已 gitignore）。

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `POTATOMUSIC_LIBRARY` | 覆盖音乐资料库目录 |
| `POTATOMUSIC_HOME` | 覆盖应用数据目录（默认 `~/.potatoplayer-super`） |
| `POTATOMUSIC_API_BASE` | 网易云服务地址，默认 `http://localhost:3000` |
| `POTATOMUSIC_API_DIR` | api-enhanced 目录 |
| `POTATOMUSIC_QQ_API_BASE` | QQ Music 服务地址，默认 `http://localhost:3200` |
| `POTATOMUSIC_QQ_API_DIR` | qq-music-api 目录 |
| `POTATOMUSIC_NODE` | Node 可执行文件路径 |
| `POTATOMUSIC_DEBUG` | 输出 Java / 在线 API 服务日志 |

## 网易云服务

应用会依次查找：

1. `POTATOMUSIC_API_DIR`
2. 工程同级的 `../api/api-enhanced-*`
3. `~/.potatoplayer-super/api/api-enhanced-*`

推荐安装到应用数据目录：

```bash
mkdir -p ~/.potatoplayer-super/api
git clone https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced.git \
  ~/.potatoplayer-super/api/api-enhanced
cd ~/.potatoplayer-super/api/api-enhanced
npm install
```

然后在 Discover 页面点击 **Start NetEase service**。也可以自己启动服务，只需把地址通过 `POTATOMUSIC_API_BASE` 指向它。

> `api-enhanced` 是独立第三方项目，不随本仓库分发。

## 数据与迁移

应用不移动或重命名你的音乐文件。

### 音乐目录

解析顺序：

1. `POTATOMUSIC_LIBRARY`
2. 新应用设置中保存的目录
3. 工程同级的 `../PotatoLibrary/source/music`（若存在）
4. `~/Music/PotatoMusic`

### 数据目录

默认 `~/.potatoplayer-super/`：

```text
settings.json             音量 / 循环 / 上次歌曲 / 上次进度
library.json              歌曲索引、收藏、歌单、块、流派
stats.json                实际聆听统计：日期、小时、曲目时长和播放次数
covers/                   新写入的封面缓存
netease_bindings.json     网易云下载的封面 / 专辑映射
netease_cookie.txt        网易云登录 cookie（不会进入仓库）
```

### 旧 Potatoplayer 数据

首次扫描会读取旧库旁边的：

```text
ratings.json              标题、歌手、评分、块、流派、播放次数、封面路径
metadata_cache.csv        标题、歌手、时长
blocks.json / genres.json 名称和颜色
.cookie                   网易云登录状态
covers/                   封面文件
```

只读导入。新版创建自己的索引；之后对块 / 流派 / 评分的修改只保存在新版数据中。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `⌘K` | 打开命令面板 |
| `⌘F` | 搜索资料库 |
| `⌘←` / `⌘→` | 上一首 / 下一首 |
| `⌘E` | 打开歌曲编辑页 |
| `⌘1` … `⌘8` | Home / Songs / Albums / Artists / Collections / Favorites / Stats / Discover |
| `Esc` | 退出沉浸模式、关闭弹层或清除搜索 |
| 点击 Now Playing 右上角 `›` | 收起播放器（变为 Mini Player） |

## 架构

```text
┌──────────────────────────────────────────────┐
│ Electron main                                │
│  · BrowserWindow / custom cover protocol     │
│  · spawns Java, secure IPC bridge            │
│  · screenshot + lifecycle                    │
└──────────────┬───────────────────────────────┘
               │ contextBridge
┌──────────────▼───────────────────────────────┐
│ React renderer                               │
│  React 19 · TypeScript · Zustand · Motion    │
│  Pages · Blocks/Genres · Discover · Player    │
└──────────────┬───────────────────────────────┘
               │ newline JSON-RPC on stdin/stdout
┌──────────────▼───────────────────────────────┐
│ Java service (no JavaFX)                     │
│  Scanner · Metadata · VLCJ · Lyrics           │
│  Taxonomy · Playlists · NetEase bridge        │
└──────────────────────────────────────────────┘
```

### 目录

```text
potatomusic/
├── electron/
│   ├── main.cjs              窗口、协议、截图、IPC
│   ├── preload.cjs           类型化安全桥
│   └── backend.cjs           Java 子进程 + JSON-RPC
├── src/
│   ├── components/           玻璃组件、播放器、沉浸页、均衡器、弹窗、命令面板
│   ├── pages/                Home / Songs / Stats / Collections / Editor / Discover …
│   ├── lib/                  封面、格式化、集合构建
│   ├── store.ts              Zustand 应用状态
│   ├── types.ts              渲染层类型
│   └── styles.css            玻璃设计系统
├── backend/
│   ├── pom.xml
│   └── src/main/java/com/potatomusic/superapp/
│       ├── Backend.java
│       ├── LibraryScanner.java
│       ├── PlaybackController.java
│       ├── Taxonomy.java
│       ├── NeteaseService.java
│       └── …
├── start.command             macOS 双击启动
├── start.sh                  macOS / Linux 终端启动
├── start.bat                 Windows 启动
├── scripts/                  构建、单测、VLC smoke、Playwright 测试
├── build/                    应用图标
└── docs/screenshots/
```

### 为什么保留 Java

旧项目的扫描、VLCJ 播放、元数据和歌词逻辑经过大量实际曲库验证。Super 没有为了“全栈重写”而把这些能力重写一遍；Electron 负责体验，Java 负责任务可靠性和原生播放。两边通过 JSON-RPC 解耦，因此前端崩溃或重启不会影响文件安全。

### 为什么不用 JavaFX 继续画

Electron 的 CSS 合成层、`backdrop-filter`、Framer Motion 和 React 组件模型更适合本项目的界面密度、转场和响应式要求。JavaFX 仍适合原生工具，但不适合这种以玻璃材质和动画为核心的视觉方向。

## 开发与测试

```bash
# TypeScript 类型检查
npm run typecheck

# Java 单元测试（文件名解析、LRC、旧库解析、Taxonomy）
npm run test:backend

# 真实 VLC 播放冒烟测试（会短暂播放声音）
npm run smoke

# Playwright UI 测试：扫描、播放、搜索、收藏、块筛选、单曲归类、
# 批量归类、网易云搜索、折叠播放器、统计、首页自定义、深色对比度
npm run test:ui

# 全部（UI 测试需要 VLC、显示器、网易云 API）
npm test
```

测试使用临时数据目录，不会改动你的真实资料库。UI 测试会额外验证：

- 316 首本地曲库渲染；
- VLC 实际播放时间推进，并写入真实聆听统计；
- 统计页热力图、深色歌词与 EQ 下拉对比度、无框歌词、排序指标列、首页模块隐藏与恢复；
- potatoHQ 3D 舞台实际渲染：逐字跟唱、镜头调度、阵列 / 逐字 / 音频开关；
- 块筛选从 310 缩到 48 首；
- 单曲修改块；
- 批量设置流派；
- 网易云登录态与搜索。

### 构建产物

- `dist/`：React 静态资源（gitignored）
- `backend/target/potatoplayer-super-backend.jar`：Java 服务（gitignored）
- `backend/target/lib/`：运行时依赖（gitignored）

## 已知限制

- **macOS 已验证**；Windows / Linux 使用相同代码路径，但尚未真机验证。macOS 隐藏标题栏 / 交通灯使用 `hiddenInset`。
- 网易云依赖外部 `api-enhanced`；QQ 音乐依赖外部 `qq-music-api`。两者都会受账号等级、地区或版权限制。
- QQ 音乐下载必须先扫码登录，且实际能否取到音频以 QQ 账号权限和上游结果为准。
- B站 MV 搜索使用公开网页搜索接口，可能被风控或受地区限制；结果在系统浏览器观看，不内嵌播放。
- 搜索结果的网易云封面在未下载前可能由渐变首字母占位；下载后会写入真实封面。
- 旧资料库没有专辑标签时，Albums 页面会按歌手生成 “artist collection”，并明确标注。
- 新版的块 / 流派 / 评分修改不会写回旧版 JSON。
- 桌面歌词、悬浮动图、屏幕起雾、BPM 等旧版实验功能没有带入 1.0.x；EQ 已在 s1.0.4 完整还原。当前版本把桌面体验集中在主窗口和 Now Playing 上。

## 致谢

- 原始 [Potatoplayer](https://github.com/why012123/Potatoplayer) Java 版及其背后的 Python 版，提供了功能清单、数据格式和 VLCJ 经验。
- [VLCJ](https://github.com/caprica/vlcj) / [libVLC](https://www.videolan.org/vlc/)。
- [Electron](https://www.electronjs.org/)、[React](https://react.dev/)、[Motion](https://motion.dev/)、[Lucide](https://lucide.dev/)。
- [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)（MIT）提供本地网易云 API。
- [qq-music-api](https://github.com/yakult-green-tea/qq-music-api)（MIT）提供本地 QQ 音乐 API、扫码登录、搜索、歌单与播放链接。
- 所有封面、音频和网易云账号数据均属于各自版权方；本仓库不附带音乐文件或账号 cookie。

## License

本仓库暂未声明开源许可证。原始 Potatoplayer 仓库同样未声明许可证；在重新分发或商用前请先联系作者。代码中的第三方依赖遵循各自许可证。
