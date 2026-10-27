#!/bin/bash
# Potato Player Launcher for macOS
# 双击运行此文件即可启动播放器

cd "$(dirname "$0")"

echo "========================================"
echo "  🎵 Potato Player 版本选择"
echo "========================================"
echo "  1) 1.0.1    - Potato.py"
echo "  2) 1.1.5    - potatoplayer version1.5r.py"
echo "  3) 1.2.0    - potatoplayer version2 release.py"
echo "  4) 最新版本  - Potatoplayer.py (tkinter)"
echo "  5) Qt 版     - Potatoplayer_qt.py (PySide6)"
echo "========================================"
read -p "请选择版本 (1/2/3/4/5，默认5): " choice </dev/tty

PYTHON=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
case "$choice" in
  1)
    echo "启动 Potato.py (1.0.1)..."
    $PYTHON Potato.py &
    PYTHON_PID=$!
    ;;
  2)
    echo "启动 potatoplayer version1.5r.py (1.1.5)..."
    $PYTHON "potatoplayer version1.5r.py" &
    PYTHON_PID=$!
    ;;
  3)
    echo "启动 potatoplayer version2 release.py (1.2.0)..."
    $PYTHON "potatoplayer version2 release.py" &
    PYTHON_PID=$!
    ;;
  4)
    echo "启动 Potatoplayer.py (tkinter 版)..."
    $PYTHON Potatoplayer.py &
    PYTHON_PID=$!
    ;;
  *)
    echo "启动 Potatoplayer_qt.py (PySide6 版)..."
    $PYTHON Potatoplayer_qt.py &
    PYTHON_PID=$!
    ;;
esac

# macOS fix: bring tkinter window to foreground so widgets receive mouse events
sleep 0.8
osascript -e 'tell application "System Events" to set frontmost of process "Python" to true' 2>/dev/null || true

exit 0
