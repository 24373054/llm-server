#!/usr/bin/env bash
# 后台启动 Web 壳
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  for d in "${CONDA_PREFIX:-}" "${HOME}/miniconda3/envs/yz" "${HOME}/anaconda3/envs/yz"; do
    if [[ -n "$d" && -x "${d}/bin/node" ]]; then
      export PATH="${d}/bin:${PATH}"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node。请: conda activate yz 或 conda install -n yz -y -c conda-forge nodejs" >&2
  exit 1
fi

export LLM_SERVER_PORT="${LLM_SERVER_PORT:-38025}"
export VLLM_BASE_URL="${VLLM_BASE_URL:-http://127.0.0.1:8000}"
export VLLM_MODEL="${VLLM_MODEL:-}"
export COMFYUI_BASE_URL="${COMFYUI_BASE_URL:-http://127.0.0.1:8188}"
export COMFYUI_CHECKPOINT="${COMFYUI_CHECKPOINT:-}"

LOG_FILE="${SCRIPT_DIR}/server.log"
PID_FILE="${SCRIPT_DIR}/server.pid"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if ps -p "$OLD_PID" > /dev/null 2>&1; then
    echo "已在运行 PID=$OLD_PID，先执行 ./stop_server.sh" >&2
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1 && lsof -ti:"$LLM_SERVER_PORT" >/dev/null 2>&1; then
  echo "端口 ${LLM_SERVER_PORT} 已被占用（可能上次未正常停止）。请先执行: ./stop_server.sh" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  if command -v npm >/dev/null 2>&1; then
    npm install
  else
    echo "缺少 node_modules 且未找到 npm，无法安装依赖。" >&2
    exit 1
  fi
fi

# 直接启动 node（避免 nohup npm 时 PID 文件指向 npm、子进程 node 占口导致 EADDRINUSE）
nohup env LLM_SERVER_PORT="$LLM_SERVER_PORT" \
  VLLM_BASE_URL="$VLLM_BASE_URL" \
  VLLM_MODEL="$VLLM_MODEL" \
  COMFYUI_BASE_URL="$COMFYUI_BASE_URL" \
  COMFYUI_CHECKPOINT="$COMFYUI_CHECKPOINT" \
  node "$SCRIPT_DIR/server.js" >> "$LOG_FILE" 2>&1 &
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
