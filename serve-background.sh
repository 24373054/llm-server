#!/usr/bin/env bash
# vLLM 后台启动：限制显存占用（不占满整卡），日志 + PID 文件。
#
# 可调环境变量（有默认值）:
#   VLLM_MODEL              默认 Qwen/Qwen3.5-0.8B
#   GPU_MEMORY_UTILIZATION  vLLM 允许使用的「整卡显存」比例 0~1，越小占得越少（KV 也会变少）
#   MAX_MODEL_LEN           上下文上限，越小 KV 越少
#   VLLM_PORT               默认 8000
#   CUDA_VISIBLE_DEVICES    默认 0
#   HF_ENDPOINT             默认 https://hf-mirror.com
#   LOG_DIR                 日志目录，默认 ~/.local/log
#
# 示例（约占 8~10GB 量级，48G 卡上可自行再调低 GPU_MEMORY_UTILIZATION）:
#   GPU_MEMORY_UTILIZATION=0.22 MAX_MODEL_LEN=4096 ./serve-background.sh
#
# 停止: kill "$(cat ~/.local/log/vllm.pid)"  或  pkill -f 'vllm serve'

set -euo pipefail

MODEL="${VLLM_MODEL:-Qwen/Qwen3.5-0.8B}"
GPU_UTIL="${GPU_MEMORY_UTILIZATION:-0.30}"
MAX_LEN="${MAX_MODEL_LEN:-8192}"
PORT="${VLLM_PORT:-8000}"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
export HF_HUB_DOWNLOAD_TIMEOUT="${HF_HUB_DOWNLOAD_TIMEOUT:-600}"

LOG_DIR="${LOG_DIR:-${HOME}/.local/log}"
mkdir -p "${LOG_DIR}"
SAFE_NAME="${MODEL//\//-}"
LOG="${LOG_DIR}/vllm-${SAFE_NAME}.log"
PIDFILE="${PIDFILE:-${LOG_DIR}/vllm.pid}"

if [[ -f "${PIDFILE}" ]] && kill -0 "$(cat "${PIDFILE}")" 2>/dev/null; then
  echo "已有进程 PID=$(cat "${PIDFILE}")，先 stop 或手动 kill 后再启动。" >&2
  exit 1
fi

echo "启动 vLLM: model=${MODEL} port=${PORT} gpu_memory_utilization=${GPU_UTIL} max_model_len=${MAX_LEN}" | tee -a "${LOG}"
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES}" | tee -a "${LOG}"

nohup vllm serve "${MODEL}" \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --gpu-memory-utilization "${GPU_UTIL}" \
  --max-model-len "${MAX_LEN}" \
  >> "${LOG}" 2>&1 &

echo $! > "${PIDFILE}"
echo "已后台启动 PID=$(cat "${PIDFILE}")"
echo "日志: ${LOG}"
echo "健康检查: curl -s http://127.0.0.1:${PORT}/health"
echo "停止: kill \"\$(cat ${PIDFILE})\""
