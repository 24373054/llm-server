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
| `COMFYUI_BASE_URL` | `http://127.0.0.1:8188` | ComfyUI HTTP 根地址（多 Agent 的 `comfy` 子任务） |
| `COMFYUI_WORKFLOW_PATH` | 仓库内 `workflow-templates/flux2-klein-distilled-api.json` | **API 格式**工作流（见下节）；不要用 UI 版 `.json` 直接当 `prompt` |
| `COMFYUI_POSITIVE_NODE_ID` | `4` | 默认 Flux 模板里 `CLIPTextEncode` 正面词节点 id |
| `COMFYUI_SAMPLER_NODE_ID` | `9` | 预留；当前对所有含 `noise_seed` / `seed` 的节点自动随机 |
| `COMFYUI_UNET_NAME` / `COMFYUI_CLIP_NAME` / `COMFYUI_VAE_NAME` | 空 | 覆盖 Flux 图里 `UNETLoader` / `CLIPLoader` / `VAELoader` 的文件名（与 Comfy 模型列表一致） |
| `COMFYUI_CHECKPOINT` | 空 | 仅对含 `CheckpointLoaderSimple` 的旧 SD 模板生效 |
| `COMFYUI_CHECKPOINT_LOADER_NODE_ID` | `4` | 旧模板里 checkpoint 节点 id |
| `MAX_AGENT_TASKS` | `4` | Planner 最多拆几个并行子任务 |
| `COMFYUI_JOB_TIMEOUT_MS` | `600000` | 单张 Comfy 任务最长等待 |

## Flux2 工作流（对齐 `Flux2-s1-TtP1.json`）

Comfy 里的 `ComfyUI/user/default/workflows/Flux2-s1-TtP1.json` 是 **前端 UI 格式**（含 subgraph），**不能**原样作为 `POST /prompt` 的 `prompt` 字段。

本仓库已提供与其 **「Text to Image (Flux.2 Klein 9B Distilled)」** 子图等价的 **API 图**：`workflow-templates/flux2-klein-distilled-api.json`（默认已使用）。你在 UI 里若改过 UNet/CLIP/VAE 文件名，请用环境变量 `COMFYUI_UNET_NAME` / `COMFYUI_CLIP_NAME` / `COMFYUI_VAE_NAME` 与之一致，或在 Comfy 中对该图 **Export (API)** 后把 `COMFYUI_WORKFLOW_PATH` 指向导出文件。

## 与 ComfyUI 对接（本机 `127.0.0.1:8188`）

1. 终端启动 ComfyUI：`python main.py --listen 127.0.0.1 --port 8188`（或你的实际端口）。  
2. 启动 llm-server 前可设：`export COMFYUI_BASE_URL=http://127.0.0.1:8188`（**默认已是该地址**）。  
3. 多 Agent 出图默认走 **`flux2-klein-distilled-api.json`**；模型名与磁盘不一致时用 **`COMFYUI_UNET_NAME` 等** 覆盖，或改用你在 Comfy 里 **Export (API)** 得到的 JSON 并设置 `COMFYUI_WORKFLOW_PATH`。  
4. 自检：`curl -s http://127.0.0.1:38025/api/comfy/status`（需 llm-server 已启动）。

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

- `GET /api/health` — 探测本机壳、vLLM、ComfyUI `/queue`
- `GET /api/models` — 转发 vLLM 模型列表
- `POST /api/chat/stream` — 流式对话（JSON：`messages`, 可选 `model` / `temperature` / `max_tokens`）
- `POST /api/agent/run` — 多 Agent 一次跑完（JSON：`goal`），返回 `tasks` / `workers` / `aggregate`
- `POST /api/agent/stream` — 同上，SSE：`event: plan|worker_done|aggregate|done|error`
- `GET /api/comfy/status` — Comfy 是否可达、`/queue` 快照、当前工作流/checkpoint 环境变量提示  
- `GET /api/comfy/view` — 代理 ComfyUI 出图（query：`filename` / `subfolder` / `type`），供前端 Markdown 插图
- `POST /v1/chat/completions` — 透明代理到 vLLM（兼容 OpenAI 客户端）

页面勾选「多 Agent 并行」即走 `/api/agent/stream`；文生图子任务需 ComfyUI 已启动且工作流与模板节点 id 一致。

## 多 Agent 行为说明

1. **Planner**：一次 vLLM 调用，输出 JSON `tasks`（`llm` 与可选的 `comfy`）。0.8B 解析失败时退化为单任务直连回答意图。  
2. **Workers**：`Promise.all` 并行——多个 `llm` 子任务各打一次 vLLM；`comfy` 子任务对 `COMFYUI_WORKFLOW_PATH` 写正面提示词后 `POST /prompt` 并轮询 `/history`。  
3. **Aggregator**：再调一次 vLLM，把各子任务输出合并成给用户的中文答复。
