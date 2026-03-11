#!/bin/bash
# 启动 LLM Chat Server（前台运行）

echo "=== 启动 LLM Chat Server ==="
echo ""

# 配置
PORT=38025
VLLM_URL="http://127.0.0.1:8000"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 node_modules
echo -e "${YELLOW}[1/3] 检查依赖...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}未找到 node_modules，正在安装依赖...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ 依赖安装失败${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ 依赖已就绪${NC}"

# 检查 vLLM 服务
echo -e "${YELLOW}[2/3] 检查 vLLM 服务...${NC}"
if curl -s ${VLLM_URL}/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ vLLM 服务已运行${NC}"
else
    echo -e "${YELLOW}⚠ vLLM 服务未运行${NC}"
    echo "请先启动 vLLM: ./start_vllm_background.sh"
    echo "或继续启动服务器（将无法处理请求）"
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 启动服务
echo -e "${YELLOW}[3/3] 启动服务器...${NC}"
echo ""
echo "端口: ${PORT}"
echo "vLLM: ${VLLM_URL}"
echo ""
echo -e "${GREEN}服务器启动中...${NC}"
echo ""

npm start
