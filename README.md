# Potato Music AI

从同级 `potatomusic` 当前工作副本创建的独立版本：保留 Java/VLC/网易云播放内核，重做音乐首页、导航、AI 对话侧栏与底部播放条，并接入 DeepSeek 流式聊天与工具调用。

## 启动

macOS 双击 `start.command`，或：

```bash
npm start
```

开发模式：`npm run dev`，渲染端口为 **5186**。需要 Node.js 22+、JDK 21+；本地音频播放需要原项目支持的播放引擎。渲染页面依赖 Electron bridge，单独打开 Vite 页面不提供桌面功能。Ultra 保留为可选模式，主界面启动不再先构建 Ultra。

打开右侧助手的齿轮，配置 DeepSeek API Key，点击「保存并测试」。也可从设置页进入。默认使用 `deepseek-flash`，模型名称可自行更改。未连接模型时仍可使用本地曲库匹配、推荐草案、播放与保存歌单。

## 原版数据继承（0.1.1）

退出新版后重新运行 `start.command`。首次启动会在打开曲库前，从原版的 `~/.potatoplayer-super` 进行一次性数据合并：封面、歌曲资料（含年份）、收藏、歌单、聆听统计、网易云绑定和 EQ 预设。已有新版编辑、有效的新封面和当前播放/音量设置优先保留；扫描得到的旧默认资料会由原版已保存资料补齐。

旧版与新版统计相加，迁移日志防止重复累计。迁移前快照、结果与报告放在 `~/.potatomusic-ai/migration-super-v1/`，原版目录只读。原版云同步绑定另作备份，不因导入自动启动云端写入。切换到不同音乐目录时不会自动混入旧曲库。

如果原版也没有年份，仍保留未知；不会推测年份。更新完成后的再次扫描会保留已经恢复的元数据与封面。使用自定义数据目录时可通过 `POTATOMUSIC_IMPORT_HOME` 指向原版数据目录，默认不会向测试/自定义目录自动导入真实数据；`POTATOMUSIC_IMPORT_SUPER=0` 可以跳过自动迁移。

## 功能

- 新首页、心情入口、真实曲库精选、最近加入。
- 底部播放器、播放队列、沉浸播放、收藏和均衡器。
- DeepSeek 多轮聊天、流式回复、取消、真实操作记录。
- **AI 工作台**：历史对话持久化，可搜索、置顶、重命名、删除和继续；每首歌有独立记忆，另有一份长期偏好索引。对话和记忆都保存在本机。
- **联网查资料**：通过 DeepSeek 官方 Search / Fetch 查询歌曲背景、发行、创作者和版本信息，回答附带可点击来源；可在 AI 连接设置里关闭。
- **Ultra**：AI 版导航中的 Dive 入口由 Ultra 三维 CD 档案页替换，按需构建并在独立窗口打开，与主播放器共享曲库和播放状态。
- 编辑歌曲的标题、歌手、专辑、评分、备注、分类、年份、歌词覆盖等资料，修改跨重扫保留，音频文件不变。
- 编排播放队列、创建和管理歌单。
- 连接已有网易云 API 搜索并加入下载任务。
- 调整主题、强调色、字体风格、密度、圆角和动效。

独立数据目录：`~/.potatomusic-ai`。会话写入 `ai-conversations.json`，歌曲记忆与长期索引写入 `ai-memory.json`；原 `potatomusic` 源码没有改动。音乐目录可共用，新增下载仍会进入你选定的音乐目录。

完整配置、数据编辑边界、当前验证状态：[AI 接入说明](docs/ai-integration.md)。原功能说明：[上游 README](docs/upstream-readme.md)。

## 验证

```bash
npm run typecheck
npm run build:renderer
npm run test:ai
npm run test:backend
npm run test:ai-metadata
npm run test:migration
npm run test:ai-ui
npm run test:ai-workspace
```

类型检查、构建、11 组 AI 模拟接口与工具测试、真实 Java 后端元数据测试、AI 桌面交互测试，以及 AI 工作台/记忆/Ultra 页面的隔离 Electron 测试均已通过。真实 DeepSeek 对话、联网搜索与网易云账号操作需要自行配置 Key/登录后验证。Ultra 第一次打开会现场构建 `ultra-rhine/dist`，可能需要几分钟和网络下载三维依赖。
