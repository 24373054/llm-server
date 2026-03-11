#!/bin/bash
# 停止 LLM Chat Server

echo "=== 停止 LLM Chat Server ==="
echo ""

PID_FILE="$HOME/yz/AI-movie/llm-server/server.pid"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f "$PID_FILE" ]; then
    echo -e "${RED}✗ 未找到 PID 文件${NC}"
    echo "尝试查找运行中的 Node.js 进程..."
    
    # 查找运行在 38025 端口的进程
    PID=$(lsof -ti:38025 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "找到进程 PID: $PID"
        kill $PID
        echo -e "${GREEN}✓ 服务器已停止${NC}"
    else
        echo "未找到运行中的服务器"
    fi
    exit 0
fi

PID=$(cat "$PID_FILE")

if ps -p $PID > /dev/null 2>&1; then
    echo "停止服务器 (PID: $PID)..."
    kill $PID
    
    # 等待进程结束
    for i in {1..10}; do
        if ! ps -p $PID > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # 如果还在运行，强制结束
    if ps -p $PID > /dev/null 2>&1; then
        echo "强制停止..."
        kill -9 $PID
    fi
    
    echo -e "${GREEN}✓ 服务器已停止${NC}"
else
    echo "服务器未运行"
fi

rm -f "$PID_FILE"
