# macOS 安装包

在 Apple Silicon Mac 上运行：

```sh
npm run package:mac
```

产物位于 `release/`：

- `PotatoMusic-<版本>-macOS-arm64.dmg`：打开后把 PotatoMusic 拖入 Applications。
- `PotatoMusic-<版本>-macOS-arm64.pkg`：通过 macOS 安装器安装到 `/Applications`。
- `SHA256SUMS.txt`：两种安装包的 SHA-256 校验值。

应用内置 Java 运行时、VLC、potatoHQ、mpv、Node、网易云及 QQ 音乐服务。安装者无需 npm、JDK、Homebrew 或独立 VLC。在线功能仍需要网络和相应服务账号。本配方仅构建 arm64，系统最低版本取打包的原生依赖要求，记录于应用的 `Contents/Resources/build-manifest.json` 和磁盘映像中的安装说明。

当前使用 ad-hoc 本地签名，未做 Developer ID 签名或 Apple 公证。首次打开若被系统拦截，可在系统设置的「隐私与安全性」中允许打开。面向外部用户正式分发时，应使用自己的 Developer ID 证书重新签名和公证。

## 构建机器依赖

保留项目已有的 `node_modules`，安装 Node、Java 21 JDK（含 jlink）、Xcode Command Line Tools、VLC 和 mpv，以及 potatoHQ 的 FFmpeg 开发库。网易云 API 默认从相邻的 `api/api-enhanced*` 读取；QQ API 默认从 `~/.potatoplayer-super/api/qq-music-api` 读取。可用 `JAVA_HOME`、`VLC_APP`、`NETEASE_API_DIR`、`QQ_API_DIR` 指定路径。

打包过程只复制运行所需的文件，不复制 `.env`、`.auth-state`、登录 cookie、个人曲库或项目源码。Ultra 在临时目录内使用自带示例资料重新构建，不改动开发目录里的个人资料。QQ 服务的可写状态位于应用用户数据目录 `services/qq`，不会写入应用包。

原生动态库的非系统依赖被递归复制并改为应用内相对路径；依赖重定位后重新签名。构建在生成安装包前运行 `scripts/package-smoke.cjs`，使用独立数据目录、合成静音 WAV 和不含 Homebrew 的 PATH，检查应用界面、Java 后端、扫描、三个播放引擎、两个音乐服务和 Ultra 窗口。测试不登录账号，也不验证远端歌曲下载。

应用签名和封装在本地临时目录中完成，避免桌面同步服务附加 Finder 元数据破坏签名。最终保留 DMG / PKG；完整应用位于安装包内。可以单独复验（默认只读挂载 DMG，完成后自动卸载）：

```sh
npm run test:package
# 或指定复制/挂载后的应用路径
node scripts/package-smoke.cjs '/path/to/PotatoMusic.app'
```

安装包保留当前源码中的功能和修改；打包不会提交 Git，也不会自动安装或覆盖 Applications 中已有的应用。
