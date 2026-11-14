# Potatoplayer AI 接入说明（s2.0.0 集成版）

本文件说明 s2.0.0 接入的 AI 功能：AI 工作台与首页 AI 栏目、Electron 侧 AI 服务/工具、曲库编辑与真实音频规格、五档下载音质与双向替换，以及可选的 Super 数据迁移。

界面保持 Super 的既有布局：三栏（侧栏 / 页面 / 常驻 Now Playing）、没有底部播放条。AI 对话窗口只出现在「AI 工作台」页面和首页的一个 AI 栏目里；右侧栏、播放控制与外观系统沿用 Super。

## 启动与配置

在项目目录执行 `npm start`，或双击 `start.command`。本集成沿用 Super 的数据目录（默认 `~/.potatoplayer-super`，可用 `POTATOMUSIC_HOME` 覆盖）：Electron 设置、播放记录、歌单与 AI 配置保存在一起。音乐目录沿用原项目的查找规则，可在侧栏重新选择文件夹。

在 AI 连接设置中填写自己的 DeepSeek API Key，选择模型，点击「保存并测试」，然后启用 DeepSeek。默认模型为官方文档中的 `deepseek-flash`，也可填写其他支持工具调用的模型名。API 地址固定为 `https://api.deepseek.com`。没有连接时使用本地检索与排序，歌曲匹配同样可用。

API Key 只交给 Electron 主进程：优先使用 Electron `safeStorage` 加密保存；加密不可用时仅在内存保留，不写入明文文件。也可用 `DEEPSEEK_API_KEY` 环境变量，并在界面启用连接。清除保存的密钥不会删除外部环境变量。聊天消息和工具需要的歌曲资料会发送给 DeepSeek，使用个人 API 账户计费。

本地文件（均在数据目录下，原子写入）：

- `ai-settings.json`：模型、启用状态、联网开关与加密后的密钥。
- `ai-conversations.json`：历史对话与每轮操作记录。
- `ai-memory.json`：歌曲记忆与长期偏好索引。

## 可直接尝试

- 「这首歌评分改成 9.6，备注写上：适合晚上听。」
- 「把这首的歌名改为……，专辑改为……」
- 「找我的高分歌曲，按歌手交错排列接下来的播放队列。」
- 「用我喜欢的歌曲新建一个歌单，叫夜晚散步。」
- 「把这个歌单按评分从高到低重排。」
- 「在网易云搜索 Lia 的鳥の詩，找到后下载高音质版本。」
- 「把这首超清母带降到无损，文件太大了。」（降级必须由用户明确要求）
- 「把 API Key 换一个模型再试。」（连接设置里可改模型；外观由设置页管理，助手不会修改主题与布局）
- 普通聊天、讨论听感与推荐理由。

下载需要已有网易云 API 服务（或 QQ 音乐 API 服务）及相应账号权限；AI 只调用原播放器的真实搜索和下载接口，不绕过版权或账号限制。它只能下载本次对话工具搜索返回的歌曲 ID。创建任务后可以从下载任务面板查看进度；「已加入任务」不代表已经下载成功。

## 数据编辑边界

可编辑标题、歌手、专辑、年份、曲目编号、流派、区块、评分、备注、收藏、播放次数、添加时间、网易云/QQ 绑定，以及 LRC 歌词覆盖。封面可以复用曲库中另一首歌的封面或清除；目前不提供让模型下载任意图片的能力。

资料修改仅写入应用索引，歌词覆盖也保存在索引中，清空覆盖可恢复原歌词。元数据覆盖会跨重扫保留。音频内容、音频文件路径、稳定歌曲 ID、文件大小和解码时长不对模型开放修改。AI 不具备删除音频文件、运行命令或任意访问文件的工具。

用户明确要求的修改会立即执行，工具执行过程显示在对话的操作记录中。删除歌单有原生确认框。停止请求会取消后续工具与网络读取，已经完成的操作不会回滚。

## 音质升级与降级

下载音质统一使用五档：`standard`（标准）、`high`（高品质 320k）、`lossless`（无损）、`hires`（Hi-Res 96k/24）、`jymaster`（超清母带 192k/24）。网易云按接口实际返回的 `level` 记录档位（平台可能降级），QQ 音乐以 FLAC 为最高可用档。

`get_quality_options` 返回一首歌的当前档位、真实音频规格（`sampleRate` / `bitDepth` / `channels` / `codec`），以及在线音源真实可下载的更高档位（`available` / `upgradeAvailable`）和实测更低档位（`downgrades` / `downgradeAvailable`）。升级和降级都通过下载队列重新下载并替换音频文件，区块、流派、评分、备注、收藏和歌单保持不变；同容器（flac/mp3）原地替换、路径不变，跨容器替换沿用现有的新路径与收藏/歌单迁移逻辑。

- `upgrade_track_quality` / `find_quality_upgrades` 只处理升级；`quality=auto` 只自动选最高可用档位，不会降级。
- `change_track_quality` 同时支持升级和降级：`quality` 指定目标档位（五档或 `auto` 只升级），`trackIds` / `minRating` / `limit` 选择歌曲；执行后端的 `library.changeQualities`，返回已排队/跳过的歌曲及每首的方向。
- 安全边界：默认下载与批量流程「只升不降」；降级只在用户本轮明确要求时发生（例如「降到无损，文件太大了」），AI 不得因为文件较大、想省空间等自行推断降级。降级会替换音频文件且不能自动回滚（只能再次升级）。
- `download_netease` / `download_qq` 选择更高档位时会自动替换已有文件；选择更低档位默认只刷新信息、不替换（`downgradeUnavailable`），需要显式降级时改用 `change_track_quality`。`download.done` 事件在替换时带 `direction`（upgrade/downgrade）；批量下载只会用更高档位替换。
- 区块/流派下载目标新增「清空」语义（`DownloadTargets.CLEAR = "__none__"`）：空字符串表示沿用原值，`__none__` 表示清空。AI 工具与 UI 使用同一套字符串。
- 单曲档位探测缓存 10 分钟，替换完成后自动失效；仅试听片段（`freeTrialInfo`）视为不可下载。请求 Hi-Res 而平台只提供超清母带时接受更高可用档位（`substituted: true`）。

## 真实音频规格与年份

扫描器写入 `sampleRate` / `bitDepth` / `channels` / `codec`，AI 的曲库工具、`get_context`、音质探测与批量结果都能读到；资料库 schema 升到 4，旧库首次启动自动重扫补全。

旧版索引/迁移记录已经带有标题、歌手和时长时，扫描器曾直接跳过音频标签，导致大量 FLAC 的 `DATE` 年份没有被读入。现在只要 `year <= 0` 或缺少音频规格就会读取 `DATE` / `YEAR`；不会根据专辑或文件名猜测年份，没有标签的歌曲仍保留未知。

## AI 工作台与记忆

AI 工作台（历史对话与记忆管理页，以及首页的 AI 栏目）共用同一套对话状态与数据：

- **历史对话**：每轮最终回复、操作记录、讨论过的歌曲和上下文轨道保存到数据目录的 `ai-conversations.json`。支持搜索、置顶、重命名、删除、继续对话；新对话不会删除旧记录。
- **歌曲记忆**：每首歌有独立的摘要和事实列表。聊到当前歌曲、或在提问中出现已记忆的歌名/歌手时，相关记忆会自动进入系统提示。记忆只按稳定的歌曲 ID 绑定，不影响音频文件或歌曲元数据。
- **长期索引**：稳定的听歌偏好、歌手/风格/场景信息保存在 `ai-memory.json`，每轮对话按重要度和关键词取用。
- **写入方式**：用户明确说「记住」、AI 判断存在值得跨会话保留的信息时，通过 `remember_song` / `remember_preference` 工具写入；也可以在工作台手动新建、编辑、删除。
- **边界**：不记录寒暄、临时状态、隐私、密钥或系统内部信息；删除记忆不会删除对话、音频或歌曲资料。

## 联网搜索与引用

在 AI 连接设置中打开「联网搜索」后，模型可以使用 DeepSeek 官方 Search / Fetch API：

- `POST https://api.deepseek.com/v1/tools/search`：按 query 搜索网页，可返回摘要与正文节选。
- `POST https://api.deepseek.com/v1/tools/fetch`：抓取单个网页并转为 Markdown 正文。

用于歌曲背景、发行时间、创作者、版本、专辑故事、演出等站外信息。工具结果会作为不可信资料交给模型，模型回答时应保留来源；UI 可把搜索结果整理成「网页来源」卡片，用系统浏览器打开公开 https 链接。搜索和抓取按成功请求计费（官方当前为每 1,000 次 5 元），不消耗模型 token 之外的额度；关闭开关后联网工具不会出现在请求的 tools 列表中。

## 实现结构

- `electron/ai-service.cjs`：加密配置、SSE 解析、多轮工具调用、超时、会话/记忆存储、Search/Fetch。
- `electron/ai-conversations.cjs` / `ai-memory.cjs`：原子写入的本地会话与记忆存储。
- `electron/ai-tools.cjs`：JSON Schema、参数验证、受限工具执行、来源收集。
- `electron/ai-policy.cjs`：按提示词选择读/写工具并决定联网与强制工具调用。
- `electron/song-match.mjs`：渲染层本地助手与模型曲库工具共用的歌曲匹配规则。
- `backend`：`AudioQuality` / `DownloadTargets`、`Backend.patchMetadata` / `Track.metadataOverrides` / `LyricsService` 歌词覆盖、真实音频规格扫描、五档音质与双向替换 RPC，以及 `SuperMigration` 一次性导入（沿用 Super 数据目录时自动跳过）。
- AI 工作台页面、首页 AI 栏目与对话状态：`src/ai/assistant.ts`、`src/ai/AiWorkspacePage.tsx`、`src/ai/AiHomeSection.tsx`、`src/ai/AiComposer.tsx`、`src/ai/AiTurnView.tsx`、`src/ai/AiConnection.tsx`。AI 外观改动的工具请求会被拒绝，并提示由 Super 设置页管理。

工具调用每轮最多 16 轮模型往返、40 个工具调用；单次网络/执行会话超时 180 秒。工具仅接受显式参数和已存在曲库 ID；外观更新的工具请求会被明确拒绝，界面外观始终由 Super 设置页管理。模型回应与曲库文本按纯文本渲染，不执行返回的 HTML 或脚本。

## 测试与当前验证状态

```bash
npm run typecheck
npm run build:backend
npm run test:backend
npm run test:ai
npm run test:ai-metadata
npm run test:discover
npm run test:migration
```

`test:ai` 覆盖 26 组 AI 服务与工具契约（含会话重启持久化、记忆注入、Search 工具与联网开关、音质双向更换工具与策略）；`test:backend` 覆盖 Java 后端检查（含音质方向/替换判定与扫描器音频规格用例）；`test:ai-metadata` 用真实 Java 后端验证索引编辑、独立平台 ID、歌词覆盖、重扫与重启持久化；`test:discover` 用隔离桌面与本地模拟接口验证真实 FLAC 升级、显式降级替换与元数据保留。AI 网络测试使用模拟 DeepSeek SSE 与模拟 Search 响应，未消耗真实 API 额度。

真实 DeepSeek 对话、联网搜索与真实网易云账号下载仍需配置后验证。

## 官方依据

- https://api-docs.deepseek.com/zh-cn/
- https://api-docs.deepseek.com/zh-cn/guides/tool_calls/
- https://api-docs.deepseek.com/zh-cn/guides/search

实现采用官方 Chat Completions、SSE 流式输出、Function Calling 与 Search / Fetch API，默认关闭 thinking，以简化工具连续执行的消息管理。

## 数据迁移（可选）

`SuperMigration.run` 在 Backend 加载设置、索引、统计、EQ 和绑定之前执行。它只在默认 AI 数据目录（`~/.potatomusic-ai`，或通过 `POTATOMUSIC_IMPORT_HOME` 显式指定来源）时自动运行；沿用 Super 数据目录时它是空操作（source == dest 或目录不匹配时直接返回）。通过当前扫描结果重建扫描基线，与原版已保存资料、新版资料进行三方比较；显式元数据覆盖与偏离扫描基线的本地修改优先保留。一次性日志先记录迁移前数据和完整预备结果，再提交各文件，中断后可重放，完成标记写入后不会重复导入收藏或歌单。

验证：`npm run test:migration`，涵盖年份、封面、较新的评分/备注、收藏、歌单、统计合并、源数据不变、崩溃恢复、幂等性与真实 Java 后端重扫。
