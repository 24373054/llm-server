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
  echo "已停止 (PID 文件)"
  exit 0
fi

PID=$(lsof -ti:"$PORT" 2>/dev/null || true)
if [ -n "${PID:-}" ]; then
  kill $PID
  echo "已停止占用端口 $PORT 的进程"
else
  echo "未找到运行中的服务"
fi
