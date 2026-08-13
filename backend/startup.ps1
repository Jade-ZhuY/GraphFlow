# Comm Agent 后端启动脚本（PowerShell 版）
# 在 PowerShell 中执行： .\startup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python startup.py
