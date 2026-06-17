# Blog Orchestrator — Windows 설정 스크립트
# 사용법: .\setup.ps1
#         .\setup.ps1 -Full
#         .\setup.ps1 -Wizard

param(
    [switch]$Full,
    [switch]$Wizard,
    [switch]$WithTests,
    [switch]$WithAuth,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$args = @("setup.mjs")

if ($Help) { $args += "--help" }
if ($Full) { $args += "--full" }
if ($Wizard) { $args += "--wizard" }
if ($WithTests) { $args += "--with-tests" }
if ($WithAuth) { $args += "--with-auth" }

# Node.js 설치 여부 확인
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Node.js가 설치되어 있지 않습니다." -ForegroundColor Red
    Write-Host "https://nodejs.org 에서 LTS(20 또는 22)를 설치한 뒤 다시 실행하세요."
    Write-Host ""
    exit 1
}

node @args
exit $LASTEXITCODE
