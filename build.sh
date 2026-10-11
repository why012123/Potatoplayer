#!/bin/bash
# 编译打包（产出 target/potatoplayer.jar）
set -e
cd "$(dirname "$0")"

MVN=".tools/apache-maven-3.9.16/bin/mvn"
if [ ! -x "$MVN" ]; then
  echo "未找到内置 Maven，请先运行 ./setup.sh 下载。"
  exit 1
fi

# Maven 需要 JAVA_HOME：JAVA_HOME 优先 → macOS 的 /usr/libexec/java_home → PATH 上的 java
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  if [ -x /usr/libexec/java_home ]; then
    JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
  fi
  if [ -z "$JAVA_HOME" ] && command -v java >/dev/null 2>&1; then
    JAVA_HOME="$(dirname "$(dirname "$(command -v java)")")"
  fi
fi
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "❌ 找不到 java。请安装 JDK 21+，或设置 JAVA_HOME 指向它。"
  exit 1
fi
export JAVA_HOME

"$MVN" -B -DskipTests package
echo "✅ 打包完成：target/potatoplayer.jar"
