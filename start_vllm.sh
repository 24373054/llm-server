#!/bin/bash
# 启动vLLM服务 - Qwen2.5-7B-Instruct

echo "=== 启动 vLLM 服务 ==="
echo ""

# 配置
MODEL_PATH="/data/Matrix/fxq/Qwen/models/Qwen/Qwen2___5-7B-Instruct"
PORT=8000
GPU_MEMORY_UTILIZATION=0.85
MAX_MODEL_LEN=8192
TENSOR_PARALLEL_SIZE=1

# 使用GPU 2（空闲的A100-SXM4-40GB）
export CUDA_VISIBLE_DEVICES=2

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查模型
echo -e "${YELLOW}[1/3] 检查模型...${NC}"
if [ ! -d "$MODEL_PATH" ]; then
    echo -e "${RED}✗ 模型未找到: ${MODEL_PATH}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 模型已找到${NC}"

# 激活环境
echo -e "${YELLOW}[2/3] 激活 conda 环境...${NC}"
source $(conda info --base)/etc/profile.d/conda.sh
conda activate deeplearning
echo -e "${GREEN}✓ 环境已激活: deeplearning${NC}"

# 启动vLLM
echo -e "${YELLOW}[3/3] 启动 vLLM 服务...${NC}"
echo ""
echo "模型: Qwen2.5-7B-Instruct"
echo "端口: ${PORT}"
echo "GPU: ${CUDA_VISIBLE_DEVICES}"
echo "GPU显存利用率: ${GPU_MEMORY_UTILIZATION}"
echo "最大序列长度: ${MAX_MODEL_LEN}"
echo ""

python -m vllm.entrypoints.openai.api_server \
    --model ${MODEL_PATH} \
    --port ${PORT} \
    --gpu-memory-utilization ${GPU_MEMORY_UTILIZATION} \
    --max-model-len ${MAX_MODEL_LEN} \
    --trust-remote-code \
    --served-model-name Qwen2.5-7B-Instruct \
    --tensor-parallel-size ${TENSOR_PARALLEL_SIZE}
