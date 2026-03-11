#!/bin/bash
# 重启 LLM Chat Server

echo "=== 重启 LLM Chat Server ==="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 停止服务
./stop_server.sh

# 等待一下
sleep 2

# 启动服务
./start_server_background.sh
