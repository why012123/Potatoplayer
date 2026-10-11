#!/bin/bash
# 下载内置 Maven 到 .tools/（仅需执行一次，或 .tools 被清理后）
set -e
cd "$(dirname "$0")"

MVN_VER=3.9.16
DEST=".tools/apache-maven-${MVN_VER}/bin/mvn"
URL="https://archive.apache.org/dist/maven/maven-3/${MVN_VER}/binaries/apache-maven-${MVN_VER}-bin.tar.gz"

if [ -x "$DEST" ]; then
  echo "✅ Maven 已存在"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "❌ 找不到 curl，无法下载 Maven。请先安装 curl，或自己装一个 Maven 3.9+ 后执行 ./build.sh。"
  exit 1
fi

echo "⬇️  下载 Apache Maven ${MVN_VER} ..."
mkdir -p .tools
if ! curl -fL --progress-bar "$URL" -o .tools/maven.tar.gz; then
  rm -f .tools/maven.tar.gz
  echo "❌ 下载失败（网络问题？）。也可以自己下载同一个包解压到 .tools/ 下。"
  exit 1
fi

tar xzf .tools/maven.tar.gz -C .tools
rm -f .tools/maven.tar.gz

if [ ! -x "$DEST" ]; then
  echo "❌ 解压后没找到 $DEST，请检查 .tools/ 内容。"
  exit 1
fi
echo "✅ 完成，现在可以 ./run.sh"
