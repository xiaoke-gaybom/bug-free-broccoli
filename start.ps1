# Review Forge 一键启动脚本
# 用法: 直接双击 start.bat (会调用本脚本)，或在 PowerShell 中执行 .\start.ps1
#
# 自动完成:
#   1. 前置检查 node/npm
#   2. 检查/安装依赖
#   3. 拉取样本评论数据 (如缺失)
#   4. 检测 .env.local 是否配置了 ANTHROPIC_API_KEY → 选择真实/mock 模式
#   5. 清理端口 3000 占用 (避免端口冲突打不开网页)
#   6. 启动 dev server (新窗口，错误可见不闪退)
#   7. 轮询等待 server 就绪后自动打开浏览器

# Ensure UTF-8 console output for Chinese characters (PS 5.1 default is ANSI).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
# $PSScriptRoot is reliable when invoked via -File; fall back for edge cases.
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $root

function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "[$n] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "    $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "    $msg" -ForegroundColor DarkGray
}

function Write-Warn($msg) {
    Write-Host "    $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "    $msg" -ForegroundColor Red
}

# Banner
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Magenta
Write-Host "    Review Forge - App Store 评测 -> PRD -> 测试" -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor Magenta

# --- Step 1: Preflight checks ---
Write-Step "1/6" "前置检查..."
$nodeExe = Get-Command node -ErrorAction SilentlyContinue
$npmExe = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeExe) {
    Write-Err "未找到 node。请先安装 Node.js (https://nodejs.org/) 并加入 PATH。"
    Read-Host "按回车键退出"
    exit 1
}
if (-not $npmExe) {
    Write-Err "未找到 npm。请检查 Node.js 安装是否完整。"
    Read-Host "按回车键退出"
    exit 1
}
Write-Ok "node $(& node --version) / npm $(& npm --version)"

# --- Step 2: Dependencies ---
Write-Step "2/6" "检查依赖..."
if (Test-Path "node_modules") {
    Write-Ok "依赖已安装"
} else {
    Write-Info "首次运行，正在安装依赖 (使用国内镜像，约 1-2 分钟)..."
    & npm install --no-audit --no-fund --registry=https://registry.npmmirror.com 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Err "依赖安装失败，请检查网络连接后重试。"
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Ok "依赖安装完成"
}

# --- Step 3: Sample data ---
Write-Step "3/6" "检查样本评论数据..."
$sampleFile = "data\sample\reviews-us-839285684.json"
if (Test-Path $sampleFile) {
    $size = (Get-Item $sampleFile).Length
    Write-Ok "样本数据已就绪 ($([math]::Round($size / 1KB)) KB)"
} else {
    Write-Info "正在从 App Store RSS 拉取样本评论 (需要外网)..."
    & npm run seed 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0 -and (Test-Path $sampleFile)) {
        Write-Ok "样本数据拉取完成"
    } else {
        Write-Warn "样本数据拉取失败 (外网不可用?)，将使用 mock 数据模式"
        Write-Warn "你仍可在 UI 中上传 data/mock/reviews-mock.json 进行测试"
    }
}

# --- Step 4: Decide mode ---
Write-Step "4/6" "检测运行模式..."
$envLocal = ".env.local"
$useMock = $true
if (Test-Path $envLocal) {
    $lines = Get-Content $envLocal -ErrorAction SilentlyContinue
    foreach ($line in $lines) {
        if ($line -match "^\s*ANTHROPIC_API_KEY\s*=\s*\S+") {
            $useMock = $false
            break
        }
    }
}

# Allow explicit override via env var
if ($env:REVIEW_FORGE_MOCK_LLM -eq "1") { $useMock = $true }

if ($useMock) {
    $mode = "dev:mock"
    Write-Warn "模式: Mock 离线模式 (无需 API Key)"
    Write-Host "    提示: 配置 .env.local 中的 ANTHROPIC_API_KEY 后将自动切换到真实 Claude" -ForegroundColor DarkGray
} else {
    $mode = "dev"
    Write-Ok "模式: 真实 Claude 分析 (检测到 ANTHROPIC_API_KEY)"
}

# --- Step 5: Free port 3000 (fix: 端口冲突会导致网页打不开) ---
Write-Step "5/6" "清理端口 3000..."
$cleared = 0
try {
    $procs = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue -Unique
    foreach ($procId in $procs) {
        if ($procId -and $procId -ne $PID) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            $cleared++
        }
    }
} catch { }
if ($cleared -gt 0) {
    Write-Warn "已停止 $cleared 个占用端口 3000 的进程"
    Start-Sleep -Seconds 1
} else {
    Write-Ok "端口 3000 空闲"
}

# --- Step 6: Start server + open browser ---
Write-Step "6/6" "启动 dev server..."
Write-Host ""
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  地址: http://localhost:3000" -ForegroundColor White
Write-Host "  停止: 在弹出的 Server 窗口按 Ctrl+C 或直接关闭" -ForegroundColor DarkGray
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Start dev server in a new window so this script can poll + open browser.
# cmd /k keeps the window open so any error stays visible (no flash-close).
$serverJob = Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$root`" && npm run $mode" -PassThru -WindowStyle Normal

# Poll until the server responds
Write-Info "等待 server 就绪 (最多 90 秒，首次编译较慢)..."
$ready = $false
$pollAttempts = 45
for ($i = 0; $i -lt $pollAttempts; $i++) {
    Start-Sleep -Seconds 2
    if ($serverJob.HasExited) {
        Write-Err "Server 进程已退出。请查看弹出的 Server 窗口中的错误信息。"
        Write-Host "    常见原因: 依赖未装好 / 端口冲突 / 配置错误" -ForegroundColor DarkGray
        Read-Host "按回车键退出"
        exit 1
    }
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/" -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # server not ready yet, keep polling
    }
}

if ($ready) {
    Write-Ok "Server 就绪，正在打开浏览器..."
    Start-Process "http://localhost:3000/"
} else {
    Write-Warn "Server 在 90 秒内未就绪。"
    Write-Host "    请查看弹出的 Server 窗口；首次编译可能较慢，" -ForegroundColor DarkGray
    Write-Host "    也可手动打开 http://localhost:3000/ 尝试。" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  Review Forge 已启动。关闭弹出的 Server 窗口即可停止。" -ForegroundColor Green
Write-Host ""

# Give the user a moment to read the status, then exit.
# The dev server keeps running in its own window.
Start-Sleep -Seconds 5
