#!/usr/bin/env bash
# Potatoplayer Ultra — one-command launcher for macOS / Linux.
set -u

cd "$(dirname "$0")" || exit 1

# Finder-launched terminals often have a much smaller PATH than an IDE shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
if [ -x /usr/libexec/java_home ]; then
  if JAVA_HOME_CANDIDATE=$(/usr/libexec/java_home -v 21 2>/dev/null); then
    export JAVA_HOME="$JAVA_HOME_CANDIDATE"
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[38;5;35m'; RED=$'\033[38;5;160m'; GOLD=$'\033[38;5;179m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; RED=''; GOLD=''; RESET=''
fi

say() { printf '%s\n' "$*"; }
step() { printf '%s\n' "${GOLD}●${RESET} $*"; }
ok() { printf '%s\n' "${GREEN}✓${RESET} $*"; }
fail() {
  printf '\n%s\n' "${RED}✕ $*${RESET}"
  if [ -t 0 ]; then
    printf '\n按回车键关闭窗口…'
    read -r _ || true
  fi
  exit 1
}

printf '\n%s\n' "${BOLD}  potato ${DIM}super${RESET}"
printf '%s\n\n' "${DIM}  A quieter room for your music.${RESET}"

# ── Node ──────────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "没有找到 Node.js。请先安装 Node.js 22+：https://nodejs.org/"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "Node.js 版本过低（当前 $(node -v)），需要 22 或更高版本。"
fi
command -v npm >/dev/null 2>&1 || fail "没有找到 npm。请重新安装 Node.js 22+。"
ok "Node $(node -v) · npm $(npm -v)"

# ── Java ──────────────────────────────────────────────────────────────────────
command -v java >/dev/null 2>&1 || fail "没有找到 Java。请安装 JDK 21+（推荐 Temurin）：https://adoptium.net/"
JAVA_MAJOR=$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)
if [ -z "${JAVA_MAJOR:-}" ] || [ "$JAVA_MAJOR" -lt 21 ]; then
  fail "Java 版本过低（当前 $(java -version 2>&1 | head -1)），需要 JDK 21+。"
fi
ok "Java $JAVA_MAJOR"

# ── VLC (playback) ────────────────────────────────────────────────────────────
if [ "$(uname -s)" = "Darwin" ]; then
  if [ -d "/Applications/VLC.app" ] || [ -d "$HOME/Applications/VLC.app" ]; then
    ok "VLC 已安装"
  else
    say "${GOLD}△${RESET} 没有找到 VLC.app；界面可以打开，但本地播放需要 VLC。"
  fi
fi

# ── Dependencies ──────────────────────────────────────────────────────────────
if [ ! -d node_modules ] || [ ! -d node_modules/electron ] || [ ! -d node_modules/react ] || [ ! -x node_modules/.bin/vite ]; then
  step "首次运行：安装前端依赖（Electron 较大，请耐心等待）"
  npm install --include=dev --no-audit --no-fund || fail "npm install 失败。请检查网络后重试。"
  ok "依赖安装完成"
else
  ok "依赖已就绪"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
# npm start runs prestart: renderer build + backend freshness check.
step "启动 Potatoplayer Ultra"
say "${DIM}  首次启动会构建 Java 音频服务和界面，之后会快很多。${RESET}"
printf '\n'
npm start
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  fail "启动失败（退出码 $STATUS）。请查看上面的错误信息。"
fi
exit 0
