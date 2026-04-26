#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/server.pid"
PORT="${LLM_SERVER_PORT:-38025}"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    kill "$PID" || true
    sleep 1
    if ps -p "$PID" > /dev/null 2>&1; then
      kill -9 "$PID" || true
    fi
  fi
  rm -f "$PID_FILE"
  echo "已停止 (PID 文件中的进程)"
fi

# 清掉仍占用端口的进程（例如旧版脚本只记了 npm PID、node 仍在监听）
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "${PIDS:-}" ]; then
    kill $PIDS 2>/dev/null || true
    sleep 1
    PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
    if [ -n "${PIDS:-}" ]; then
      kill -9 $PIDS 2>/dev/null || true
    fi
    echo "已释放端口 $PORT"
    exit 0
  fi
fi

echo "端口 $PORT 上无监听进程（若仍报错请检查是否换端口或 root 权限）"
