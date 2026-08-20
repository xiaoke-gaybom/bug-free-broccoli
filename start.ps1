# Review Forge 一键启动脚本
# 用法: 直接运行 start.bat (会调用本脚本)，或在 PowerShell 中执行 .\start.ps1
#
# 自动完成:
#   1. 检查/安装依赖
#   2. 拉取样本评论数据 (如缺失)
#   3. 检测 .env.local 是否配置了 ANTHROPIC_API_KEY → 选择真实/mock 模式
#   4. 启动 dev server
#   5. 轮询等待 server 就绪后自动打开浏览器

# Ensure UTF-8 console output for Chinese characters (PS 5.1 default is ANSI).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
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

# Banner
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Magenta
Write-Host "    Review Forge - App Store 评测 -> PRD -> 测试" -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor Magenta

# --- Step 1: Dependencies ---
Write-Step "1/4" "检查依赖..."
if (Test-Path "node_modules") {
    Write-Ok "依赖已安装"
} else {
    Write-Info "首次运行，正在安装依赖 (使用国内镜像，约 1-2 分钟)..."
    & npm install --no-audit --no-fund --registry=https://registry.npmmirror.com 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "    依赖安装失败，请检查网络连接后重试。" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Ok "依赖安装完成"
}

# --- Step 2: Sample data ---
Write-Step "2/4" "检查样本评论数据..."
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

# --- Step 3: Decide mode ---
Write-Step "3/4" "检测运行模式..."
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

# --- Step 4: Start server + open browser ---
Write-Step "4/4" "启动 dev server..."
Write-Host ""
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  地址: http://localhost:3000" -ForegroundColor White
Write-Host "  停止: 在弹出的 Server 窗口按 Ctrl+C 或直接关闭" -ForegroundColor DarkGray
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Kill any process already listening on port 3000 (avoids EADDRINUSE)
try {
    $existing = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Warn "检测到端口 3000 已被占用 (PID $existing)，正在停止..."
        Stop-Process -Id $existing -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
} catch { }

# Start dev server in a new window so this script can poll + open browser
$serverJob = Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$root`" && npm run $mode" -PassThru -WindowStyle Normal

# Poll until the server responds
Write-Info "等待 server 就绪..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if ($serverJob.HasExited) {
        Write-Host "    Server 进程已退出，请查看弹出的窗口中的错误信息。" -ForegroundColor Red
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
    Write-Warn "Server 在 60 秒内未就绪，请手动打开 http://localhost:3000/"
}

Write-Host ""
Write-Host "  Review Forge 已启动。关闭弹出的 Server 窗口即可停止。" -ForegroundColor Green
Write-Host ""

# Give the user a moment to read the status, then exit.
# The dev server keeps running in its own window.
Start-Sleep -Seconds 3
