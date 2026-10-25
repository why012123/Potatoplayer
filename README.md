# Potatoplayer Super

**一个从旧 Potatoplayer Java 版重构而来的 Electron 桌面音乐播放器。**  
保留 Java + VLCJ 的播放与扫描内核，彻底重做 UI、动效和信息架构。  
块、流派和网易云是这个版本的核心，而不是附属设置。

> 当前版本：`1.0.0` · 运行平台：macOS（主力验证）；Windows / Linux 代码路径已保留但未真机验证。

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
- **视觉系统**：现代 iOS 毛玻璃、暖色纸张底、动态封面环境色、统一圆角和阴影。
- **动效系统**：共享导航指示器、页面弹簧转场、封面交叉淡入、悬浮抬升、正在播放均衡器、下载进度、命令面板。
- **核心业务优先**：块 / 流派 / 网易云都获得独立页面、管理和批量操作，而不是藏在设置里。

## 界面

| Songs | Blocks & Genres |
| --- | --- |
| ![Songs](docs/screenshots/songs.jpg) | ![Blocks and Genres](docs/screenshots/collections.jpg) |

| Discover (NetEase) | Tag detail |
| --- | --- |
| ![Discover](docs/screenshots/discover.jpg) | ![Tag detail](docs/screenshots/tag.jpg) |

<p align="center">
  <img src="docs/screenshots/manager.jpg" width="720" alt="Blocks and genres manager" />
</p>

## 核心功能

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
- 折叠后变成毛玻璃 Mini Player，仍可播放、暂停和打开面板。

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
- **单曲编辑**：任意歌曲的 `···` 菜单 → Blocks & genre…，修改块、流派和 0–10 分评分。
- **完整管理器**：创建、改名、改色、删除；删除只清除标签，不删除文件。
- 用户修改在重扫后保留；已删除的旧标签不会因为再次读取旧资料库而复活。

> 新版不会回写旧版 `ratings.json`。数据迁移只发生一次，之后以
> `~/.potatoplayer-super/library.json` 为准。

## 网易云

Discover 页面：

- 本地 `api-enhanced` 服务状态检测与一键启动。
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
| `POTATOMUSIC_NODE` | Node 可执行文件路径 |
| `POTATOMUSIC_DEBUG` | 输出 Java / api-enhanced 日志 |

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
| `⌘1` … `⌘7` | Home / Songs / Albums / Artists / Collections / Favorites / Discover |
| `Esc` | 关闭弹层或清除搜索 |
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
│   ├── components/           玻璃组件、播放器、弹窗、命令面板
│   ├── pages/                Home / Songs / Collections / Discover …
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

# Playwright UI 测试：扫描、播放、搜索、收藏、块筛选、
# 单曲归类、批量归类、网易云搜索、折叠播放器
npm run test:ui

# 全部（UI 测试需要 VLC、显示器、网易云 API）
npm test
```

测试使用临时数据目录，不会改动你的真实资料库。UI 测试会额外验证：

- 310 首本地曲库渲染；
- VLC 实际播放时间推进；
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
- 网易云依赖外部 `api-enhanced`，且部分歌曲会受账号等级、地区或版权限制。
- 搜索结果的网易云封面在未下载前可能由渐变首字母占位；下载后会写入真实封面。
- 旧资料库没有专辑标签时，Albums 页面会按歌手生成 “artist collection”，并明确标注。
- 新版的块 / 流派 / 评分修改不会写回旧版 JSON。
- 桌面歌词、悬浮动图、屏幕起雾、BPM / EQ 等旧版实验功能没有带入 1.0.0；当前版本把桌面体验集中在主窗口和 Now Playing 上。

## 致谢

- 原始 [Potatoplayer](https://github.com/why012123/Potatoplayer) Java 版及其背后的 Python 版，提供了功能清单、数据格式和 VLCJ 经验。
- [VLCJ](https://github.com/caprica/vlcj) / [libVLC](https://www.videolan.org/vlc/)。
- [Electron](https://www.electronjs.org/)、[React](https://react.dev/)、[Motion](https://motion.dev/)、[Lucide](https://lucide.dev/)。
- [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)（MIT）提供本地网易云 API。
- 所有封面、音频和网易云账号数据均属于各自版权方；本仓库不附带音乐文件或账号 cookie。

## License

本仓库暂未声明开源许可证。原始 Potatoplayer 仓库同样未声明许可证；在重新分发或商用前请先联系作者。代码中的第三方依赖遵循各自许可证。
