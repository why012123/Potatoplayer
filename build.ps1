# Potato Player（Java 版）：编译打包（Windows / PowerShell）→ target\potatoplayer.jar

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$MVN = '.tools\apache-maven-3.9.16\bin\mvn.cmd'
if (-not (Test-Path -LiteralPath $MVN)) {
    Write-Host '未找到内置 Maven，请先运行 .\setup.bat 下载。'
    exit 1
}

# Maven 需要 JAVA_HOME：JAVA_HOME 优先，其次 PATH 上的 java
if ((-not $env:JAVA_HOME) -or (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe')))) {
    $cmd = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($cmd) { $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $cmd.Source) }
}
if ((-not $env:JAVA_HOME) -or (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe')))) {
    Write-Host '❌ 找不到 java。请安装 JDK 21+，或设置 JAVA_HOME 指向它。'
    exit 1
}

& $MVN -B -DskipTests package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '✅ 打包完成：target\potatoplayer.jar'
