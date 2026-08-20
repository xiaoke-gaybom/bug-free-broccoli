# Review Forge 一键启动脚本
# 双击 start.bat 调用本脚本
# 行为: 前置检查 -> 清端口 3000 -> 前台起 dev server -> 后台轮询就绪后自动开浏览器
# 停止: 关闭本窗口 或 按 Ctrl+C

# Ensure UTF-8 console output for Chinese characters (PS 5.1 default is ANSI).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $root

# Banner
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Magenta
Write-Host "    Review Forge - App Store 评测 -> PRD -> 测试" -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor Magenta

# --- 1. 前置检查 ---
Write-Host ""
Write-Host "[1/5] 前置检查..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "    未找到 node。请先安装 Node.js (https://nodejs.org/) 并加入 PATH。" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "    未找到 npm。请检查 Node.js 安装。" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}
Write-Host "    node $(& node --version) / npm $(& npm --version)" -ForegroundColor Green

# --- 2. 依赖 ---
Write-Host "[2/5] 检查依赖..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "    首次运行，安装依赖中 (国内镜像，约 1-2 分钟)..." -ForegroundColor DarkGray
    & npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    依赖安装失败，请检查网络后重试。" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
}
Write-Host "    依赖就绪" -ForegroundColor Green

# --- 3. 决定模式 ---
Write-Host "[3/5] 检测运行模式..." -ForegroundColor Cyan
$useMock = $true
if (Test-Path ".env.local") {
    foreach ($line in Get-Content ".env.local" -ErrorAction SilentlyContinue) {
        if ($line -match "^\s*ANTHROPIC_API_KEY\s*=\s*\S+") { $useMock = $false; break }
    }
}
if ($env:REVIEW_FORGE_MOCK_LLM -eq "1") { $useMock = $true }
$mode = if ($useMock) { "dev:mock" } else { "dev" }
if ($useMock) {
    Write-Host "    Mock 离线模式 (无需 API Key，数据/后端真实，仅 LLM 分析走 canned)" -ForegroundColor Yellow
} else {
    Write-Host "    真实 Claude 模式 (检测到 ANTHROPIC_API_KEY)" -ForegroundColor Green
}

# --- 4. 清端口 3000 (避免端口冲突导致网页打不开) ---
Write-Host "[4/5] 清理端口 3000..." -ForegroundColor Cyan
try {
    $procs = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue -Unique
    foreach ($procId in $procs) {
        if ($procId -and $procId -ne $PID) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
} catch { }
Write-Host "    端口已清理" -ForegroundColor Green

# --- 5. 前台启动 server + 后台轮询开浏览器 ---
Write-Host "[5/5] 启动 dev server..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  地址: http://localhost:3000  (浏览器将自动打开)" -ForegroundColor White
Write-Host "  停止: 关闭本窗口 或 按 Ctrl+C" -ForegroundColor DarkGray
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 后台轮询：server 就绪后自动打开浏览器（最多等 120 秒）
$opener = Start-Job -ScriptBlock {
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/" -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) {
                Start-Process "http://localhost:3000/"
                break
            }
        } catch {
            # server 尚未就绪，继续轮询
        }
    }
}

# 前台运行 dev server：输出直接显示在本窗口（错误可见，不会闪退），
# 关闭本窗口或 Ctrl+C 即停止 server。
try {
    & npm run $mode
} finally {
    $opener | Stop-Job -ErrorAction SilentlyContinue
    $opener | Remove-Job -ErrorAction SilentlyContinue
}
