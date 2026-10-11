#!/bin/bash
# Potato Player（Java 版）启动脚本
#
# 源码没变化时直接起 java：省掉每次启动都跑一遍 Maven 的固定开销
# （实测 `mvn process-classes` 单独就要 1.2 秒，外加一个 220MB 的 Maven JVM）。
# 只有源码 / pom 变了（或第一次跑）才调 Maven 编译 + 刷新依赖路径表。
set -e
cd "$(dirname "$0")"

MVN=".tools/apache-maven-3.9.16/bin/mvn"
CLASSES="target/classes"
APP_CLASS="$CLASSES/com/potato/player/App.class"
CPFILE="target/run-classpath.txt"

# 找 JDK 21+：JAVA_HOME 优先 → macOS 的 /usr/libexec/java_home → PATH 上的 java
find_java() {
  if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    echo "$JAVA_HOME/bin/java"
    return
  fi
  if [ -x /usr/libexec/java_home ]; then
    local home
    home="$(/usr/libexec/java_home 2>/dev/null || true)"
    if [ -n "$home" ] && [ -x "$home/bin/java" ]; then
      echo "$home/bin/java"
      return
    fi
  fi
  command -v java 2>/dev/null || true
}

JAVA="$(find_java)"
if [ -z "$JAVA" ]; then
  echo "❌ 找不到 java。请安装 JDK 21+（Temurin / Oracle 均可），或设置 JAVA_HOME 指向它。"
  exit 1
fi
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$JAVA")")}"

# 参数分流：-D / -X 这类是 JVM 选项，必须放在类名之前 ——
# 这样 `./run.sh -Dpotato.baseDir=/path/to/PotatoLibrary` 才真的生效。
JAVA_OPTS=()
APP_ARGS=()
for arg in "$@"; do
  case "$arg" in
    -D*|-X*|-javaagent:*|--add-opens*|--enable-*) JAVA_OPTS+=("$arg") ;;
    *) APP_ARGS+=("$arg") ;;
  esac
done

if [ ! -x "$MVN" ]; then
  echo "未找到内置 Maven，请先运行 ./setup.sh 下载。"
  exit 1
fi

# 要重新编译吗？源码 / pom 比 App.class 新，或者依赖路径表还没生成过
NEED_BUILD=0
[ -f "$APP_CLASS" ] || NEED_BUILD=1
[ -f "$CPFILE" ] || NEED_BUILD=1
if [ "$NEED_BUILD" = 0 ] && [ -n "$(find src pom.xml -newer "$APP_CLASS" 2>/dev/null | head -1)" ]; then
  NEED_BUILD=1
fi

if [ "$NEED_BUILD" = 1 ]; then
  echo "🔧 源码有变化，编译中（这一步只在改动后第一次启动时出现）..."
  if ! "$MVN" -q -B -o compile dependency:build-classpath -Dmdep.outputFile="$CPFILE"; then
    echo "（离线编译失败，改为联网重试）"
    "$MVN" -q -B compile dependency:build-classpath -Dmdep.outputFile="$CPFILE"
  fi
fi

# JavaFX 放 module-path，其余依赖放 class-path（与 javafx-maven-plugin 的做法一致）
FULL="$(cat "$CPFILE")"
MODULE_PATH="$(echo "$FULL" | tr ':' '\n' | grep '/org/openjfx/' | paste -sd: -)"
CLASSPATH="$(echo "$FULL" | tr ':' '\n' | grep -v '/org/openjfx/' | paste -sd: -)"

if [ -z "$MODULE_PATH" ] || [ -z "$CLASSPATH" ]; then
  echo "（依赖路径表不完整，回退到 Maven 启动）"
  exec "$MVN" -q -B javafx:run "${JAVA_OPTS[@]+"${JAVA_OPTS[@]}"}"
fi

echo "🎵 启动 Potato Player (Java) ..."
exec "$JAVA" \
  "${JAVA_OPTS[@]+"${JAVA_OPTS[@]}"}" \
  --module-path "$MODULE_PATH" \
  --add-modules javafx.base,javafx.controls,javafx.graphics \
  -cp "$CLASSES:$CLASSPATH" \
  com.potato.player.App "${APP_ARGS[@]+"${APP_ARGS[@]}"}"
