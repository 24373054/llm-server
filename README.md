# llm-server

极简 **Node + 静态页** 对话壳：浏览器走本服务，本服务把请求转到本机 **vLLM OpenAI 兼容接口**（默认 `http://127.0.0.1:8000`）。

## 依赖

- Node：`npm` 需在 `PATH` 中。推荐在 conda 环境 `yz` 中安装：`conda install -n yz -y -c conda-forge nodejs`  
- 未 `conda activate yz` 时，`./start_server.sh` 会尝试自动使用 `~/miniconda3/envs/yz/bin/npm`。

## 前提

已单独启动 vLLM，例如：

```bash
export HF_ENDPOINT=https://hf-mirror.com
vllm serve "Qwen/Qwen3.5-0.8B" --gpu-memory-utilization 0.3 --max-model-len 8192
```

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `VLLM_BASE_URL` | `http://127.0.0.1:8000` | vLLM 根地址 |
| `VLLM_MODEL` | 空 | 发给 vLLM 的 `model` 名；**不填**则首次对话前从 `GET /v1/models` 取第一个 |
| `LLM_SERVER_PORT` | `38025` | 本 Web 服务端口 |

## 启动

```bash
cd /home/Matrix/yz/llm-server
npm install

# 可选：与当前 vLLM 模型 id 一致（见 vLLM 启动日志里的 served_model_name）
export VLLM_MODEL="Qwen/Qwen3.5-0.8B"

./start_server.sh
# 或后台
./start_server_background.sh
```

停止后台：`./stop_server.sh`

## 页面

浏览器打开 `http://127.0.0.1:38025`（端口以 `LLM_SERVER_PORT` 为准）。内测码见 `public/script.js` 中 `ACCESS_CODE`。

## 测试 vLLM

```bash
VLLM_MODEL="Qwen/Qwen3.5-0.8B" ./test_vllm.sh
```

## API（简要）

- `GET /api/health` — 探测本机壳 + vLLM
- `GET /api/models` — 转发 vLLM 模型列表
- `POST /api/chat/stream` — 流式对话（JSON：`messages`, 可选 `model` / `temperature` / `max_tokens`）
- `POST /v1/chat/completions` — 透明代理到 vLLM（兼容 OpenAI 客户端）
