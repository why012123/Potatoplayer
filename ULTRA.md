# Potatoplayer Ultra

**Ultra 不是仿制界面，而是直接把 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的源码作为基础**，
只替换档案数据、增加播放桥接。视觉、开场、相机、玻璃模型、解密、360° 查看器、字体与音效都来自原仓库。

> 上游为 MIT；《明日方舟》/莱茵生命的名称、标志、原 PV、原作视觉不在 MIT 授权内。
> 本目录是本地个人使用的研究性 fork，不要作为官方明日方舟产品再分发。

## 打开方式

1. 重启 Super（新版本）
2. 菜单 **Window → Open Potatoplayer Ultra**，或按 `⌘⇧U`
3. 也可以在 `⌘K` 命令面板搜索 **Potatoplayer Ultra**

独立启动：

```sh
npm run ultra
```

首次运行会构建 Ultra（`ultra-rhine/` 是独立的 Vite 工程），之后 `npm start` 会在资料库变化时自动重建。

## 数据映射

`ultra-rhine/scripts/generate-music-archives.mjs` 读取
`~/.potatoplayer-super/library.json`，把原版的 5 列 × 8 份档案替换为：

- 5 个曲目最多的命名区块（不含“未分组”）
- 每个区块评分最高的 8 首
- 共 40 份“音乐档案”

保留原版的 5×8 几何、编号 `X-001…X-040`、列名、详情结构与动效。

| 原版字段 | 音乐库 |
|---|---|
| `title` | 歌曲名 |
| `en` | 歌手 |
| `department` / `category` | 区块 |
| `date` | 专辑 |
| `lead` | 歌手 / 年份 |
| `abstract` | 备注，或自动生成的简介 |
| `findings` | 评分/播放/格式、时长/流派/专辑、入库日期/文件名 |
| `trackId` | Super 的歌曲 ID，用于播放 |

## 播放

- `ACCESS FILE` / `Enter`：打开详情并开始播放当前档案对应的歌曲
- 详情底部新增 **PLAY / PAUSE**，走 Super 的后端
- 空格：播放 / 暂停
- 播放队列 = 40 份档案的歌曲顺序
- 和 Super 共享播放状态；Super 里切歌，Ultra 的播放状态也会跟着变

## 构建

```sh
npm run build:ultra   # 生成音乐档案并构建 ultra-rhine/dist
npm run ultra         # 构建 + 以 Ultra 模式启动
```

`ultra-rhine/` 是独立 Vite 工程，有自己的 `package.json`、`node_modules` 和构建产物；
Super 的渲染器不打包 Three.js。

## 与 Super 的关系

- 共享同一个 Java 后端、播放引擎、资料库与设置。
- 不改 Super 的列表、筛选、下载与编辑逻辑。
- Ultra 是第二个窗口 / 第二套前端；可以单独启动，也可以从 Super 打开。

## 已知限制

- 档案墙固定 5×8 = 40 首，不是全部 324 首；完整资料库仍在 Super。
- 封面没有贴到档案盒上，保持原版的白色档案盒外观。
- 搜索只覆盖这 40 份档案。
- 不是通用组件库；这是对上游完整应用的 fork。
- 资料库变化后需要重建（`npm run build:ultra` 或重启 Super 时的自动检查）。

## 上游与改动

见 [`ultra-rhine/ATTRIBUTION.md`](ultra-rhine/ATTRIBUTION.md)。
