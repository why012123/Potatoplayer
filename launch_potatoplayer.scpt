#!/usr/bin/osascript
-- Potato Player Launcher for macOS
-- 双击运行此文件即可启动播放器

tell application "Finder"
    set currentPath to POSIX path of (container of (path to me) as alias)
end tell

do shell script "cd " & quoted form of currentPath & " && /usr/local/bin/python3 Potatoplayer.py > /dev/null 2>&1 &"
