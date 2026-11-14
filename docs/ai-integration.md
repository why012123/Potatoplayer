# Potato Music AI 接入说明

## 启动与配置

在项目目录执行 `npm start`，或双击 `start.command`。新版本的数据目录默认是 `~/.potatomusic-ai`，Electron 设置、播放记录、歌单与 AI 配置和原版隔离。音乐目录沿用原项目的查找规则；可在左下角重新选择文件夹。

点击助手右上角齿轮，或「设置 → AI 音乐助手 → 配置 AI 连接」。填写自己的 DeepSeek API Key，选择模型，点击「保存并测试」，然后启用 DeepSeek。默认模型为官方文档中的 `deepseek-flash`，也可填写其他支持工具调用的模型名。API 地址固定为 `https://api.deepseek.com`。没有连接时使用本地检索与排序，界面会明确标注。

API Key 只交给 Electron 主进程：优先使用 Electron `safeStorage` 加密保存；加密不可用时仅在内存保留，不写入明文文件。也可用 `DEEPSEEK_API_KEY` 环境变量，并在界面启用连接。清除保存的密钥不会删除外部环境变量。聊天消息和工具需要的歌曲资料会发送给 DeepSeek，使用个人 API 账户计费。

## 可直接尝试

- 「这首歌评分改成 9.6，备注写上：适合晚上听。」
- 「把这首的歌名改为……，专辑改为……」
- 「找我的高分歌曲，按歌手交错排列接下来的播放队列。」
- 「用我喜欢的歌曲新建一个歌单，叫夜晚散步。」
- 「把这个歌单按评分从高到低重排。」
- 「在网易云搜索 Lia 的鳥の詩，找到后下载高音质版本。」
- 「把这首超清母带降到无损，文件太大了。」（降级必须由用户明确要求）
- 「界面改为深色，强调色改为海蓝，减少动画。」
- 普通聊天、讨论听感与推荐理由。

下载需要已有网易云 API 服务及相应账号权限；AI 只调用原播放器的真实搜索和下载接口，不绕过版权或账号限制。它只能下载本次对话工具搜索返回的歌曲 ID。创建任务后可以从右上角下载任务查看进度；“已加入任务”不代表已经下载成功。

## 数据编辑边界

可编辑标题、歌手、专辑、年份、曲目编号、流派、区块、评分、备注、收藏、播放次数、添加时间、网易云/QQ 绑定，以及 LRC 歌词覆盖。封面可以复用曲库中另一首歌的封面或清除；暂未加入让模型下载任意图片的功能。

资料修改仅写入应用索引，歌词覆盖也保存在索引中，清空覆盖可恢复原歌词。元数据覆盖会跨重扫保留。音频内容、音频文件路径、稳定歌曲 ID、文件大小和解码时长不对模型开放修改。AI 不具备删除音频文件、运行命令或任意访问文件的工具。

用户明确要求的修改会立即执行，工具执行过程显示在对话的操作记录中。删除歌单有原生确认框。停止请求会取消后续工具与网络读取，已经完成的操作不会回滚。

## 音质升级与降级

`get_quality_options` 返回一首歌的当前档位、真实音频规格，以及在线音源真实可下载的更高档位（`available` / `upgradeAvailable`）和实测更低档位（`downgrades` / `downgradeAvailable`）。升级和降级都通过下载队列重新下载并替换音频文件，区块、流派、评分、备注、收藏和歌单保持不变；同容器（flac/mp3）原地替换、路径不变，跨容器替换沿用现有的新路径与收藏/歌单迁移逻辑。

- `upgrade_track_quality` / `find_quality_upgrades` 只处理升级；`quality=auto` 只自动选最高可用档位，不会降级。
- `change_track_quality` 同时支持升级和降级：`quality` 指定目标档位（`standard` / `high` / `lossless` / `hires` / `jymaster`，或 `auto` 只升级），`trackIds` / `minRating` / `limit` 选择歌曲；执行后端的 `library.changeQualities`，返回已排队/跳过的歌曲及每首的方向。
- 安全边界：默认下载与批量流程“只升不降”；降级只在用户本轮明确要求时发生（例如「降到无损，文件太大了」），AI 不得因为文件较大、想省空间等自行推断降级。降级会替换音频文件且不能自动回滚（只能再次升级）。
- `download_netease` / `download_qq` 选择更高档位时会自动替换已有文件；选择更低档位默认只刷新信息、不替换（`downgradeUnavailable`），需要显式降级时改用 `change_track_quality`。`download.done` 事件在替换时带 `direction`（upgrade/downgrade）。

## 年份与 FLAC 标签

旧版索引/迁移记录已经带有标题、歌手和时长时，扫描器曾直接跳过音频标签，导致大量 FLAC 的 `DATE` 年份没有被读入。现在只要 `year <= 0` 就会读取 `DATE` / `YEAR`，资料库 schema 从 2 升到 3；旧库升级后首次启动会自动重扫补全。不会根据专辑或文件名猜测年份，没有标签的歌曲仍保留未知。

## AI 工作台与记忆

左侧「AI 工作台」是历史对话和记忆的管理页。

- **历史对话**：每轮最终回复、操作记录、讨论过的歌曲和上下文轨道会保存到 `~/.potatomusic-ai/ai-conversations.json`。支持搜索、置顶、重命名、删除、继续对话；「新对话」只新建会话，不会删除旧记录。
- **歌曲记忆**：每首歌有独立的摘要和事实列表。聊到当前歌曲、或在提问中出现已记忆的歌名/歌手时，相关记忆会自动进入系统提示。记忆只按稳定的歌曲 ID 绑定，不影响音频文件或歌曲元数据。
- **长期索引**：稳定的听歌偏好、歌手/风格/场景信息保存在 `ai-memory.json`，每轮对话按重要度和关键词取用。歌曲记忆也会形成一份简短索引表，方便快速回看。
- **写入方式**：用户明确说「记住」、AI 判断存在值得跨会话保留的信息时，通过 `remember_song` / `remember_preference` 工具写入；也可以在 AI 工作台手动新建、编辑、删除。
- **边界**：不记录寒暄、临时状态、隐私、密钥或系统内部信息；删除记忆不会删除对话、音频或歌曲资料。

## 联网搜索与引用

在 AI 连接设置中打开「联网搜索」后，模型可以使用 DeepSeek 官方 Search / Fetch API：

- `POST https://api.deepseek.com/v1/tools/search`：按 query 搜索网页，可返回摘要与正文节选。
- `POST https://api.deepseek.com/v1/tools/fetch`：抓取单个网页并转为 Markdown 正文。

用于歌曲背景、发行时间、创作者、版本、专辑故事、演出等站外信息。工具结果会作为不可信资料交给模型，模型回答时应保留来源；界面会把搜索结果整理成「网页来源」卡片，点击用系统浏览器打开。搜索和抓取按成功请求计费（官方当前为每 1,000 次 5 元），不消耗模型 token 之外的额度；关闭开关后联网工具不会出现在请求的 tools 列表中。

## Ultra

AI 版用 Ultra 三维 CD 档案页替换了原来的 Dive 入口。页面实时读取 AI 版曲库统计，点击「打开 Ultra」会在独立窗口启动 `ultra-rhine`，共享后端与播放状态。首次打开若 `ultra-rhine/dist` 不存在，会通过 Electron IPC 现场运行 `npm run build:ultra`；构建读取 `~/.potatomusic-ai/library.json`（也兼容 `POTATOMUSIC_HOME` / `POTATOMUSIC_ULTRA_LIBRARY`，并回退到旧版 `~/.potatoplayer-super/library.json`）。Dive 旧页面仍保留代码，但不再出现在 AI 版导航、命令面板或当前路由入口。

## 实现结构

- `src/ai/AiHomePage.tsx`：新首页。
- `src/ai/AiWorkspacePage.tsx`：AI 工作台（对话历史、歌曲记忆、长期索引）。
- `src/ai/UltraPage.tsx`：Ultra 目的地页与按需构建/打开。
- `src/ai/AiShell.tsx`：导航、搜索、底部播放器、队列。
- `src/ai/AssistantPanel.tsx`：流式对话、歌曲结果卡片、来源卡片、操作记录。
- `src/ai/AiComposer.tsx` / `AiTurnView.tsx`：侧栏与工作台共用的输入和对话渲染。
- `src/ai/AiConnection.tsx`：启用、模型、密钥、连接测试、联网搜索开关。
- `src/ai/assistant.ts`：本地匹配和 DeepSeek IPC provider、会话状态、取消与请求隔离。
- `src/ai/memory.ts`：记忆快照、保存、删除。
- `electron/ai-service.cjs`：加密配置、SSE 解析、多轮工具调用、超时、会话/记忆存储、Search/Fetch。
- `electron/ai-conversations.cjs` / `ai-memory.cjs`：原子写入的本地会话与记忆存储。
- `electron/ai-tools.cjs`：JSON Schema、参数验证、受限工具执行、来源收集。
- `Backend.patchMetadata` / `Track.metadataOverrides`：索引编辑与重扫保护。

工具调用每轮最多 10 个模型往返、40 个工具调用；单次网络/执行会话超时 180 秒。工具仅接受显式参数和已存在曲库 ID，外观更新等待渲染层确认后才报告成功。模型回应与曲库文本按纯文本渲染，不执行返回的 HTML 或脚本。

## 测试与当前验证状态

```bash
npm run typecheck
npm run build:renderer
npm run test:ai
npm run test:backend
npm run test:ai-metadata
npm run test:ai-ui
npm run test:ai-workspace
```

已通过：TypeScript、前端构建、26 组 AI 接口与工具测试（含会话重启持久化、记忆注入、Search 工具与联网开关、音质双向更换工具与策略）、原后端检查、真实 Java 后端元数据集成测试，以及隔离 Electron 的 AI UI/工作台/记忆/Ultra 页面测试。AI 网络测试使用模拟 DeepSeek SSE 与模拟 Search 响应，未消耗真实 API 额度。

真实 DeepSeek 对话、联网搜索与真实网易云账号下载仍需配置后验证；Ultra 首次构建需要网络安装 `ultra-rhine` 的三维依赖。

## 官方依据

- https://api-docs.deepseek.com/zh-cn/
- https://api-docs.deepseek.com/zh-cn/guides/tool_calls/
- https://api-docs.deepseek.com/zh-cn/guides/search

实现采用官方 Chat Completions、SSE 流式输出、Function Calling 与 Search / Fetch API，默认关闭 thinking，以简化工具连续执行的消息管理。


## 0.1.1 原版数据补迁移

`SuperMigration.run` 在 Backend 加载设置、索引、统计、EQ 和绑定之前执行。只在默认 AI 数据目录（或显式导入来源）且音乐根目录一致时自动运行。通过当前扫描结果重建扫描基线，与原版已保存资料、新版资料进行三方比较；显式元数据覆盖与偏离扫描基线的本地修改优先保留。独立封面复制到新版 covers，曲库共享封面保持原路径。所有继承字段标记为元数据覆盖以跨重扫保留。

一次性日志先记录迁移前数据和完整预备结果，再提交各文件。中断后重放预备结果，避免重新累加统计。完成标记写入后不再重新导入收藏或歌单，避免复活后续删除。云同步配置仅备份，现有新版连接与密钥不受影响。

验证：`npm run test:migration`，涵盖年份、封面、较新的评分/备注、收藏、歌单、时长/次数/每小时桶、EQ 合并、源数据不变、崩溃恢复、幂等性、首次启动以及真实 Java 后端重扫。另以用户当前数据的临时副本试跑：384 首歌均有有效封面，72 首歌保留已知年份，30 首收藏、5 个歌单与 13 天统计恢复；显式新版编辑保留，原目录未写入。实际用户目录将在下一次退出并重启新版时迁移。


## 0.3.0 助手执行与平台标识

- 当前歌曲完整资料、网易云 ID、QQ MID 和近期歌曲结果随每轮请求提供；平台标识不是账号凭据。
- 增加 `get_track_bindings` / `update_track_bindings`，支持纯 ID 与标准平台歌曲链接。QQ MID 可用 `qqMid` 或兼容字段 `qqId` 编辑。
- 网易云 ID 与 QQ MID 独立保存，修改或清除一个不再清掉另一个。兼容原来的 `qq:` 绑定格式，编辑器也支持同时绑定。
- 增加 QQ 搜索/下载、聆听统计工具。同一应用会话中保留当前对话的在线搜索候选，下一轮可继续下载；不同平台的候选 ID 分开校验。
- 歌曲背景、发行信息等研究请求先调用网页搜索；明确工具任务使用 `tool_choice`，只承诺未执行时补一次执行机会。普通聊天不强迫工具调用；用户禁止联网时本轮移除并拒绝网页工具。
- 只对临时网页 HTTP 错误重试一次，单轮网页正文限 3 页；同轮完全相同的写入调用去重，避免重复加队列/下载。
- 当前验证：22 组 AI 测试、TypeScript 检查、前端构建及后端检查通过。真实模型行为未在本环境验证；桌面自动化启动失败。按用户要求，本次不制作安装包。

实现参数核对： https://api-docs.deepseek.com/api/create-chat-completion/ ， https://api-docs.deepseek.com/api/search/ 。

找歌修复：在线 API 的返回结果须通过关键词或结构化歌曲条件匹配，才进入可下载候选；未匹配的条目仅作为待核实线索。保留平台别名、译名，原版过滤排除明确 Live/Remix/翻唱/伴奏标记；零结果可自动去除搜索指令词或用明确歌名/歌手重试一次，保留原始歌手和版本约束。本地搜索先严格匹配，失败后才清理指令词，避免破坏恰好包含这些词的歌名。
