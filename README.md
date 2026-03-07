# LLM Chat Server

本地LLM对话服务，使用Qwen2.5-7B-Instruct模型，通过vLLM提供高性能推理。

## 特性

- 本地部署，无需调用外部API
- 流式响应，实时显示生成内容
- 极简界面，专注对话体验
- 内测码保护
- 移动端适配

## 快速开始

### 1. 安装依赖

```bash
cd /home/Matrix/yz/AI-movie/llm-server
npm install
```

### 2. 启动vLLM服务

```bash
# 在一个终端窗口启动vLLM
bash start_vllm.sh
```

等待模型加载完成（约1-2分钟），看到 "Application startup complete" 后继续。

### 3. 启动Web服务

```bash
# 在另一个终端窗口启动Node.js服务
npm start
```

### 4. 访问

- 本地：http://localhost:38025
- 校园网：http://10.143.12.80:38025
- 公网（需配置）：https://llm.matrixlabs.cn

**内测码**：`llm2025`

## API文档

### 健康检查

```bash
GET /api/health
```

### 获取模型信息

```bash
GET /api/models
```

### 对话（流式）

```bash
POST /api/chat/stream

{
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "top_p": 0.9
}
```

### 对话（非流式）

```bash
POST /api/chat

{
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 2048
}
```

## 模型信息

- **模型**：Qwen2.5-7B-Instruct
- **位置**：`/data/Matrix/fxq/Qwen/models/Qwen/Qwen2___5-7B-Instruct`
- **参数量**：7B
- **显存占用**：约14GB（FP16）
- **推理引擎**：vLLM
- **最大序列长度**：8192 tokens

## 性能

- **首token延迟**：~100ms
- **生成速度**：~50-80 tokens/s
- **并发支持**：多用户共享GPU
- **GPU**：A100 40GB

## 配置FRP（公网访问）

在公网服务器的frps.toml中添加：

```toml
[[proxies]]
name = "llm-chat"
type = "tcp"
localIP = "127.0.0.1"
localPort = 38025
remotePort = 38025
```

在本地服务器的frpc.toml中添加：

```toml
[[proxies]]
name = "llm-chat"
type = "tcp"
localIP = "127.0.0.1"
localPort = 38025
remotePort = 38025
```

然后配置Nginx和SSL证书（参考p2p-server的配置）。

## 故障排查

### vLLM无法启动

```bash
# 检查GPU可用性
nvidia-smi

# 检查端口占用
netstat -tlnp | grep 8000

# 查看vLLM日志
# 日志会直接输出到终端
```

### Web服务无法连接vLLM

```bash
# 测试vLLM健康状态
curl http://localhost:8000/health

# 测试模型列表
curl http://localhost:8000/v1/models
```

### 显存不足

修改 `start_vllm.sh` 中的参数：

```bash
GPU_MEMORY_UTILIZATION=0.7  # 降低显存利用率
MAX_MODEL_LEN=4096          # 减少最大序列长度
```

## 其他可用模型

服务器上还有以下模型可用：

1. **Qwen3-8B** - `/data/Matrix/yz/.cache_backup/models--Qwen--Qwen3-8B/`
2. **Qwen2.5-VL-7B-Instruct** - `/data/Matrix/radar/Pre/models/Qwen/Qwen2___5-VL-7B-Instruct/`（多模态）
3. **LLaVA-v1.6-Vicuna-7B** - `/data/Matrix/radar/Pre/models/Llava/llava-v1.6-vicuna-7b/`（多模态）

切换模型只需修改 `start_vllm.sh` 中的 `MODEL_PATH`。

## 成本节省

使用本地LLM替代DeepSeek API：

- DeepSeek API：~¥0.001/1K tokens
- 本地部署：电费成本（A100功耗约250W）
- 月节省：取决于使用量，高频使用可节省数百元

## 注意事项

1. vLLM会占用约14GB显存，确保GPU有足够空间
2. 首次启动需要加载模型，约1-2分钟
3. 建议使用GPU 2, 6, 7（当前空闲）
4. 不要在训练任务运行时启动vLLM
