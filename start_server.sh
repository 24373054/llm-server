#!/usr/bin/env bash
# 前台启动 Web 壳（需已自行启动 vLLM）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 未 conda activate 时，尽量用上 yz 里的 npm（需已: conda install -n yz -c conda-forge nodejs）
if ! command -v npm >/dev/null 2>&1; then
  for d in "${CONDA_PREFIX:-}" "${HOME}/miniconda3/envs/yz" "${HOME}/anaconda3/envs/yz"; do
    if [[ -n "$d" && -x "${d}/bin/npm" ]]; then
      export PATH="${d}/bin:${PATH}"
      break
    fi
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请执行: conda activate yz" >&2
  echo "若 yz 中仍无 npm: conda install -n yz -y -c conda-forge nodejs" >&2
  exit 1
fi

export LLM_SERVER_PORT="${LLM_SERVER_PORT:-38025}"
export VLLM_BASE_URL="${VLLM_BASE_URL:-http://127.0.0.1:8000}"
export VLLM_MODEL="${VLLM_MODEL:-}"
export COMFYUI_BASE_URL="${COMFYUI_BASE_URL:-http://127.0.0.1:8188}"
# 若默认工作流里的 ckpt 与你本机文件名不一致，可设置，例如: export COMFYUI_CHECKPOINT="xxx.safetensors"
export COMFYUI_CHECKPOINT="${COMFYUI_CHECKPOINT:-}"

echo "LLM_SERVER_PORT=$LLM_SERVER_PORT"
echo "VLLM_BASE_URL=$VLLM_BASE_URL"
echo "VLLM_MODEL=${VLLM_MODEL:-<首次请求从 vLLM 自动读取>}"
echo "COMFYUI_BASE_URL=$COMFYUI_BASE_URL"
echo "COMFYUI_CHECKPOINT=${COMFYUI_CHECKPOINT:-<未设置，用工作流 JSON 内 ckpt_name>}"

if [ ! -d node_modules ]; then
  npm install
fi

if ! curl -sf "${VLLM_BASE_URL}/health" >/dev/null; then
  echo "警告: 无法访问 ${VLLM_BASE_URL}/health ，请确认 vLLM 已启动。"
fi

if ! curl -sf "${COMFYUI_BASE_URL}/queue" >/dev/null; then
  echo "警告: 无法访问 ${COMFYUI_BASE_URL}/queue ，多 Agent 的 Comfy 子任务将失败；请确认 ComfyUI 已启动。"
fi

exec npm start
