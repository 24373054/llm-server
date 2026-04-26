#!/usr/bin/env bash
set -euo pipefail
BASE="${VLLM_BASE_URL:-http://127.0.0.1:8000}"
MODEL="${VLLM_MODEL:-}"

echo "GET $BASE/health"
curl -sf "$BASE/health" && echo "" || { echo "vLLM 不可达"; exit 1; }

echo ""
echo "GET $BASE/v1/models"
curl -sf "$BASE/v1/models" | python3 -m json.tool

if [ -z "$MODEL" ]; then
  MODEL=$(curl -sf "$BASE/v1/models" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])")
fi
echo ""
echo "使用 model=$MODEL 测试 chat"
curl -sf "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"用一句话说你好\"}],\"max_tokens\":64}" \
  | python3 -m json.tool
