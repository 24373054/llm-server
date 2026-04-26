#!/usr/bin/env bash
# 后台启动 Web 壳
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  for d in "${CONDA_PREFIX:-}" "${HOME}/miniconda3/envs/yz" "${HOME}/anaconda3/envs/yz"; do
    if [[ -n "$d" && -x "${d}/bin/npm" ]]; then
      export PATH="${d}/bin:${PATH}"
      break
    fi
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请: conda activate yz 或安装 nodejs 到 yz 环境。" >&2
  exit 1
fi

export LLM_SERVER_PORT="${LLM_SERVER_PORT:-38025}"
export VLLM_BASE_URL="${VLLM_BASE_URL:-http://127.0.0.1:8000}"
export VLLM_MODEL="${VLLM_MODEL:-}"

LOG_FILE="${SCRIPT_DIR}/server.log"
PID_FILE="${SCRIPT_DIR}/server.pid"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if ps -p "$OLD_PID" > /dev/null 2>&1; then
    echo "已在运行 PID=$OLD_PID，先执行 ./stop_server.sh"
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if [ ! -d node_modules ]; then
  npm install
fi

nohup env LLM_SERVER_PORT="$LLM_SERVER_PORT" VLLM_BASE_URL="$VLLM_BASE_URL" VLLM_MODEL="$VLLM_MODEL" \
  npm start >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
sleep 1
if ps -p "$(cat "$PID_FILE")" > /dev/null 2>&1; then
  echo "已启动 PID=$(cat "$PID_FILE") 端口=$LLM_SERVER_PORT"
  echo "日志: $LOG_FILE"
  echo "打开: http://127.0.0.1:${LLM_SERVER_PORT}"
else
  echo "启动失败，见 $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
