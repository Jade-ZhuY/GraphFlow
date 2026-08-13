@echo off
chcp 65001 >nul
REM Comm Agent 后端启动脚本（Windows 批处理版）
REM 双击即可运行

cd /d "%~dp0"
python startup.py

pause
