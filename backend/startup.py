#!/usr/bin/env python3
"""Comm Agent 后端启动脚本。

执行后会弹出一个选择框，让用户选择监听主机、端口以及是否启用开发模式（热重载），
确认后使用 uvicorn 启动 FastAPI 服务。
"""
from __future__ import annotations

import subprocess
import sys
import tkinter as tk
from tkinter import messagebox, ttk


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
APP_ENTRYPOINT = "app.main:app"


def start_server(host: str, port: int, reload: bool) -> None:
    """构造 uvicorn 命令并在当前终端中启动服务。"""
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        APP_ENTRYPOINT,
        "--host",
        host,
        "--port",
        str(port),
    ]
    if reload:
        cmd.append("--reload")

    # 关闭选择框，避免占用终端
    root.destroy()

    # 用 subprocess.run 阻塞当前进程，保持控制台窗口
    try:
        subprocess.run(cmd, check=False)
    except KeyboardInterrupt:
        pass


def on_start() -> None:
    """点击启动按钮后的校验与启动逻辑。"""
    host = host_var.get().strip()
    port_str = port_var.get().strip()
    reload = reload_var.get()

    if not host:
        messagebox.showerror("错误", "请选择主机地址")
        return

    try:
        port = int(port_str)
        if not (1 <= port <= 65535):
            raise ValueError
    except ValueError:
        messagebox.showerror("错误", "端口号必须是 1-65535 之间的整数")
        return

    start_server(host, port, reload)


root = tk.Tk()
root.title("Comm Agent 后端启动器")
root.geometry("380x240")
root.resizable(False, False)

frame = ttk.Frame(root, padding=20)
frame.pack(fill=tk.BOTH, expand=True)

# 主机地址
host_label = ttk.Label(frame, text="主机地址：")
host_label.grid(row=0, column=0, sticky=tk.W, pady=8)
host_var = tk.StringVar(value=DEFAULT_HOST)
host_combo = ttk.Combobox(
    frame,
    textvariable=host_var,
    values=["127.0.0.1", "0.0.0.0", "localhost"],
    state="readonly",
    width=24,
)
host_combo.grid(row=0, column=1, sticky=tk.EW, pady=8)

# 端口
port_label = ttk.Label(frame, text="端口：")
port_label.grid(row=1, column=0, sticky=tk.W, pady=8)
port_var = tk.StringVar(value=str(DEFAULT_PORT))
port_entry = ttk.Entry(frame, textvariable=port_var, width=26)
port_entry.grid(row=1, column=1, sticky=tk.EW, pady=8)

# 开发模式
reload_var = tk.BooleanVar(value=True)
reload_check = ttk.Checkbutton(
    frame,
    text="启用开发模式（修改代码后自动重载）",
    variable=reload_var,
)
reload_check.grid(row=2, column=0, columnspan=2, sticky=tk.W, pady=12)

# 启动按钮
start_btn = ttk.Button(frame, text="启动服务", command=on_start)
start_btn.grid(row=3, column=0, columnspan=2, pady=16)

frame.columnconfigure(1, weight=1)

# 让回车键也能触发启动
root.bind("<Return>", lambda _event: on_start())

root.mainloop()
