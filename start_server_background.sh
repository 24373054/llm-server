#!/bin/bash
# 后台启动 LLM Chat Server

echo "=== 后台启动 LLM Chat Server ==="
echo ""

# 配置
PORT=38025
VLLM_URL="http://127.0.0.1:8000"
LOG_FILE="$HOME/yz/AI-movie/llm-server/server.log"
PID_FILE="$HOME/yz/AI-movie/llm-server/server.pid"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查是否已经运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo -e "${RED}✗ 服务器已在运行 (PID: $OLD_PID)${NC}"
        echo "如需重启，请先执行: ./stop_server.sh"
        exit 1
    else
        # PID 文件存在但进程不存在，清理旧文件
        rm -f "$PID_FILE"
    fi
fi

# 检查依赖
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
    echo "建议先启动 vLLM: ./start_vllm_background.sh"
fi

# 启动服务
echo -e "${YELLOW}[3/3] 启动服务器...${NC}"
echo ""
echo "端口: ${PORT}"
echo "vLLM: ${VLLM_URL}"
echo "日志: ${LOG_FILE}"
echo ""

# 后台启动并保存 PID
nohup npm start > ${LOG_FILE} 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"

# 等待服务启动
sleep 2

# 检查服务是否成功启动
if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 服务器已启动 (PID: $SERVER_PID)${NC}"
    echo ""
    echo "访问地址:"
    echo "  本地: http://localhost:${PORT}"
    echo "  网络: http://10.143.12.80:${PORT}"
    echo ""
    echo "管理命令:"
    echo "  查看日志: tail -f ${LOG_FILE}"
    echo "  检查状态: curl http://localhost:${PORT}/api/health"
    echo "  停止服务: ./stop_server.sh"
else
    echo -e "${RED}✗ 服务器启动失败${NC}"
    echo "查看日志: cat ${LOG_FILE}"
    rm -f "$PID_FILE"
    exit 1
fi
