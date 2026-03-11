#!/bin/bash
# 后台启动vLLM服务

echo "=== 后台启动 vLLM 服务 ==="
echo ""

# 配置
MODEL_PATH="/data/Matrix/fxq/Qwen/models/Qwen/Qwen2___5-7B-Instruct"
PORT=8000
LOG_FILE="$HOME/yz/AI-movie/llm-server/vllm.log"

# 使用GPU 2（空闲的A100-SXM4-40GB）
export CUDA_VISIBLE_DEVICES=6

# 检查是否已经运行
if pgrep -f "vllm.entrypoints.openai.api_server" > /dev/null; then
    echo "✗ vLLM 已在运行"
    echo "如需重启，请先执行: pkill -f vllm.entrypoints.openai.api_server"
    exit 1
fi

# 激活环境并启动
source $(conda info --base)/etc/profile.d/conda.sh
conda activate deeplearning

echo "启动 vLLM 服务..."
echo "模型: Qwen2.5-7B-Instruct"
echo "端口: ${PORT}"
echo "GPU: ${CUDA_VISIBLE_DEVICES}"
echo "日志: ${LOG_FILE}"
echo ""

nohup python -m vllm.entrypoints.openai.api_server \
    --model ${MODEL_PATH} \
    --port ${PORT} \
    --gpu-memory-utilization 0.85 \
    --max-model-len 8192 \
    --trust-remote-code \
    --served-model-name Qwen2.5-7B-Instruct \
    --tensor-parallel-size 1 \
    > ${LOG_FILE} 2>&1 &

echo "✓ vLLM 正在后台启动..."
echo ""
echo "查看日志: tail -f ${LOG_FILE}"
echo "检查状态: curl http://localhost:8000/health"
echo "停止服务: pkill -f vllm.entrypoints.openai.api_server"
echo ""
echo "等待约1-2分钟让模型加载完成..."
