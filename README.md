# Potato Player

简单的 Python 音乐播放器，支持 mp3 与 flac，能读取封面、歌手、时长，带进度条、随机/顺序/单曲/列表循环播放模式，以及简易歌单保存/加载功能。

音乐文件位置（相对于 `Potato.py`）：

```
./sources/music/
```

安装依赖：

```bash
python3 -m pip install -r requirements.txt
# macOS: 需要安装 VLC（播放器后端），例如：
# brew install --cask vlc
```

运行：

```bash
python3 Potato.py
```

歌单文件：`playlists.json`（脚本同级目录），保存用户歌单。

注意事项：
- 需安装 VLC（作为 libvlc 后端），确保 `vlc` 可用。
- 如果没有 `sources/music`，请创建并放入 mp3 或 flac 文件。
