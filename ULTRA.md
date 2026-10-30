# Potatoplayer Ultra

**Ultra 直接使用 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的原仓库源码**，
视觉、开场、相机、玻璃模型、解密、360° 查看器、字体与音效都不是仿制；我们只改了数据、布局和播放桥接。

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

`npm start` 会在资料库变化后自动重建 Ultra。

## 布局

原版的 5×8 固定 40 份已经改成**可滚动的 8 列档案库**：

- 8 列 = 8 个区块（含“未分组”）
- 每列 = 该区块的全部歌曲（最多 103 首）
- 屏幕始终保留原版的 5×8 取景，上下移动时整组阵列沿纵深滚动
- 共 **324 首**，不再只展示 40 首
- 左下角显示当前列/列内位置，例如 `COLUMN 04 / 08`、`01 / 32`

## 封面贴纸

生成的每条记录带 `trackPath` 对应的封面，封面被绘制成一张**带白边、投影、轻微旋转的贴纸**，
贴在档案盒玻璃前方：

- 选中并抽出档案后，贴纸随模型一起抬起
- 详情视图里可清楚看到封面贴纸
- 贴纸完全不改模型几何，只增加一层透明平面
- 背景阵列的档案是侧向密集排列，正面被前一张挡住，所以阵列中只能看到侧边；
  要看封面请选中文件（`ACCESS FILE` / `Enter`）

## 数据与播放

`ultra-rhine/scripts/generate-music-archives.mjs` 读取
`~/.potatoplayer-super/library.json`，把每条记录映射为：

| 字段 | 音乐库 |
|---|---|
| `title` | 歌曲名（详情大标题） |
| `en` | 歌手（详情副标题） |
| `department` / `category` | 区块 |
| `date` | 专辑 |
| `lead` | 歌手 / 年份 |
| `abstract` | 备注，或自动生成的简介 |
| `findings` | 评分/播放/格式、时长/流派/专辑、入库日期/文件名 |
| `trackId` | Super 的歌曲 ID，用于播放 |
| `coverPath` | 本地封面，用于贴纸 |

播放：

- `ACCESS FILE` / `Enter`：打开详情并播放当前档案对应的歌曲
- 详情底部 **PLAY / PAUSE**
- 空格：播放 / 暂停
- 队列 = 当前档案库的记录顺序
- 与 Super 共享后端和播放状态

## 测试静音

隐藏窗口/自动化测试会加载 `?silent=1`：

- 应用音效与配乐全部关闭
- 打开文件时先把后端静音
- 手动打开正常窗口不受影响，仍保留原版 UI 音效（环境配乐默认关闭）

## 构建

```sh
npm run build:ultra   # 生成音乐档案并构建 ultra-rhine/dist
npm run ultra         # 构建 + 以 Ultra 模式启动
```

`ultra-rhine/` 是独立 Vite 工程，有自己的 `package.json`、`node_modules` 和构建产物；
Super 的渲染器不打包 Three.js。

## 已知限制

- 封面贴纸只在选中/抽取后的模型上可见；背景阵列的正面被遮挡。
- 8 列中一次显示约 5 列，左右切换列。
- 资料库变化后需要重建（`npm run build:ultra`，或重启 Super 时的自动检查）。
- 不是通用组件库；这是对上游完整应用的 fork。

## 上游与改动

见 [`ultra-rhine/ATTRIBUTION.md`](ultra-rhine/ATTRIBUTION.md)。
