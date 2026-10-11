# Potato Player（Java 版）启动脚本（Windows / PowerShell）
#
# 与 run.sh 等价：源码没变化时直接起 java —— 省掉每次启动都跑一遍 Maven 的固定开销
# （一个 Maven JVM 就要 1~2 秒）。只有源码 / pom 变了（或第一次跑）才编译 + 刷新依赖路径表。
#
# 用法（在仓库根目录）：
#   .\run.bat
#   .\run.bat -Dpotato.baseDir=D:\Music\PotatoLibrary
#
# 注意：-D / -X 开头的参数是给 JVM 的，其余参数给程序。

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$MVN      = '.tools\apache-maven-3.9.16\bin\mvn.cmd'
$CLASSES  = 'target\classes'
$APPCLASS = 'target\classes\com\potato\player\App.class'
$CPFILE   = 'target\run-classpath.txt'

# ── 找 JDK：JAVA_HOME 优先，其次 PATH 上的 java ──
function Find-Java {
    if ($env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME 'bin\java.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $cmd = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$java = Find-Java
if (-not $java) {
    Write-Host '❌ 找不到 java。请安装 JDK 21+（Temurin / Oracle 均可），或设置 JAVA_HOME 指向它。'
    exit 1
}
if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $java)
}

# ── 参数分流：-D / -X 这类是 JVM 选项，必须放在类名之前 ──
$javaOpts = @()
$appArgs = @()
foreach ($a in $args) {
    if ($a -match '^-(D|X)|^-javaagent:|^--add-opens|^--enable-') { $javaOpts += $a }
    else { $appArgs += $a }
}

if (-not (Test-Path -LiteralPath $MVN)) {
    Write-Host '未找到内置 Maven，请先运行 .\setup.bat 下载。'
    exit 1
}

# ── 要重新编译吗？源码 / pom 比 App.class 新，或者依赖路径表还没生成过 ──
$needBuild = $false
if ((-not (Test-Path -LiteralPath $APPCLASS)) -or (-not (Test-Path -LiteralPath $CPFILE))) {
    $needBuild = $true
} else {
    $ref = (Get-Item -LiteralPath $APPCLASS).LastWriteTime
    $newer = Get-ChildItem -Path 'src', 'pom.xml' -Recurse -File -ErrorAction SilentlyContinue |
             Where-Object { $_.LastWriteTime -gt $ref } |
             Select-Object -First 1
    if ($newer) { $needBuild = $true }
}

if ($needBuild) {
    Write-Host '🔧 源码有变化，编译中（这一步只在改动后第一次启动时出现）...'
    & $MVN -q -B -o compile dependency:build-classpath "-Dmdep.outputFile=$CPFILE"
    if ($LASTEXITCODE -ne 0) {
        Write-Host '（离线编译失败，改为联网重试）'
        & $MVN -q -B compile dependency:build-classpath "-Dmdep.outputFile=$CPFILE"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

# ── JavaFX 放 module-path，其余依赖放 class-path（与 run.sh / javafx-maven-plugin 一致）──
# Windows 的 classpath 分隔符是 ';'，jar 路径里是 '\'，所以匹配要同时认两种斜杠。
$full = (Get-Content -LiteralPath $CPFILE -Raw).Trim()
$parts = $full -split ';' | Where-Object { $_ -ne '' }
$modulePath = ($parts | Where-Object { $_ -match '[\\/]org[\\/]openjfx[\\/]' }) -join ';'
$classPath  = ($parts | Where-Object { $_ -notmatch '[\\/]org[\\/]openjfx[\\/]' }) -join ';'

if ((-not $modulePath) -or (-not $classPath)) {
    Write-Host '（依赖路径表不完整，回退到 Maven 启动）'
    & $MVN -q -B javafx:run @javaOpts
    exit $LASTEXITCODE
}

Write-Host '🎵 启动 Potato Player (Java) ...'
& $java @javaOpts `
    --module-path $modulePath `
    --add-modules javafx.base,javafx.controls,javafx.graphics `
    -cp "$CLASSES;$classPath" `
    com.potato.player.App @appArgs
exit $LASTEXITCODE
