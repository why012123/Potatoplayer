# Potato Player（Java 版）：下载内置 Maven 到 .tools\（Windows / PowerShell）
#
# 只需要跑一次（或者 .tools 被清掉之后）。用 zip 包 + Expand-Archive，
# 不依赖 curl / tar，Win10 自带的 PowerShell 5.1 就能跑。

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # 默认的进度条会让 Invoke-WebRequest 慢好几倍
Set-Location -LiteralPath $PSScriptRoot

$ver  = '3.9.16'
$dest = ".tools\apache-maven-$ver\bin\mvn.cmd"

if (Test-Path -LiteralPath $dest) {
    Write-Host '✅ Maven 已存在'
    exit 0
}

$url = "https://archive.apache.org/dist/maven/maven-3/$ver/binaries/apache-maven-$ver-bin.zip"
$zip = '.tools\maven.zip'

Write-Host "⬇️  下载 Apache Maven $ver ..."
New-Item -ItemType Directory -Force -Path '.tools' | Out-Null

try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
} catch {
    Write-Host "❌ 下载失败：$($_.Exception.Message)"
    Write-Host '   也可以自己下载同一个 zip 解压到 .tools\ 下。'
    exit 1
}

try {
    Expand-Archive -LiteralPath $zip -DestinationPath '.tools' -Force
} catch {
    Write-Host "❌ 解压失败：$($_.Exception.Message)"
    exit 1
} finally {
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $dest)) {
    Write-Host "❌ 解压后没找到 $dest，请检查 .tools\ 内容。"
    exit 1
}
Write-Host '✅ 完成，现在可以运行 .\run.bat'
