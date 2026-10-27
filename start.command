#!/bin/bash
# Double-click this file in Finder. Terminal stays visible for logs and errors.
cd "$(dirname "$0")" || exit 1
printf '\033]0;Potatoplayer Ultra\007'
clear
bash ./start.sh
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  printf '\n按回车键关闭窗口…'
  read -r _ || true
fi
exit "$STATUS"
