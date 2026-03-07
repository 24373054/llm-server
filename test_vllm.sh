#!/bin/bash
# 测试vLLM服务

echo "=== 测试 vLLM 服务 ==="
echo ""

# 1. 健康检查
echo "[1/3] 健康检查..."
curl -s http://localhost:8000/health && echo "" || echo "✗ vLLM未运行"

# 2. 获取模型列表
echo ""
echo "[2/3] 获取模型列表..."
curl -s http://localhost:8000/v1/models | python3 -m json.tool

# 3. 测试对话
echo ""
echo "[3/3] 测试对话..."
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen2.5-7B-Instruct",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 100
  }' | python3 -m json.tool

echo ""
echo "=== 测试完成 ==="
