# LLM Chat API Documentation

**Base URL**: `http://140.143.183.163:38025` (Internal) / `https://llm.matrixlabs.cn` (Public - to be configured)

**Version**: 1.0.0

**Last Updated**: 2026-03-08

---

## Overview

This API provides conversational AI capabilities using Qwen2.5-7B-Instruct model running on vLLM inference engine. The service offers:

1. **Streaming Chat**: Real-time streaming responses for interactive conversations
2. **Standard Chat**: Non-streaming responses for batch processing
3. **OpenAI-Compatible API**: Drop-in replacement for OpenAI Chat Completions API

The service runs on dedicated GPU hardware with automatic load balancing through FRP.

---

## Authentication

All API requests require an access token in the session. For web interface access, use the beta code: `llm2025`

For programmatic access, include the token in your session storage or implement your own authentication layer.

---

## API Endpoints

### 1. Health Check

Check if the service and vLLM backend are available.

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "ok",
  "vllm": "connected",
  "model": "Qwen2.5-7B-Instruct"
}
```

**Status Codes**:
- `200`: Service is healthy
- `503`: Service unavailable

---

### 2. Streaming Chat (Recommended)

Send messages and receive streaming responses in real-time. Best for interactive chat interfaces.

**Endpoint**: `POST /api/chat/stream`

**Content-Type**: `application/json`

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `messages` | Array | Yes | - | Array of message objects (OpenAI format) |
| `temperature` | Float | No | 0.7 | Sampling temperature (0.0-2.0) |
| `max_tokens` | Integer | No | 2048 | Maximum tokens to generate |
| `top_p` | Float | No | 0.9 | Nucleus sampling parameter |

**Message Format**:
```json
{
  "role": "user" | "assistant" | "system",
  "content": "message text"
}
```

**Example Request (cURL)**:
```bash
curl -X POST http://140.143.183.163:38025/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048
  }' \
  --no-buffer
```

**Example Request (Python)**:
```python
import requests
import json

url = "http://140.143.183.163:38025/api/chat/stream"
data = {
    "messages": [
        {"role": "user", "content": "Explain quantum computing in simple terms"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048
}

response = requests.post(url, json=data, stream=True)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            content = line[6:]  # Remove 'data: ' prefix
            if content != '[DONE]':
                try:
                    chunk = json.loads(content)
                    delta = chunk['choices'][0]['delta']
                    if 'content' in delta:
                        print(delta['content'], end='', flush=True)
                except:
                    pass
```

**Example Request (JavaScript)**:
```javascript
async function streamChat(messages) {
    const response = await fetch('http://140.143.183.163:38025/api/chat/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048
        })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const content = line.slice(6);
                if (content === '[DONE]') {
                    console.log('\nStream complete');
                    return;
                }
                try {
                    const data = JSON.parse(content);
                    const delta = data.choices[0].delta;
                    if (delta.content) {
                        process.stdout.write(delta.content);
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    }
}

streamChat([
    { role: 'user', content: 'Explain quantum computing in simple terms' }
]);
```

**Response Format** (Server-Sent Events):
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1772912288,"model":"Qwen2.5-7B-Instruct","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1772912288,"model":"Qwen2.5-7B-Instruct","choices":[{"index":0,"delta":{"content":"Quantum"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1772912288,"model":"Qwen2.5-7B-Instruct","choices":[{"index":0,"delta":{"content":" computing"},"logprobs":null,"finish_reason":null}]}

...

data: [DONE]
```

**Response Fields**:
- `id` (string): Unique completion ID
- `choices[0].delta.content` (string): Text chunk from the model
- `choices[0].delta.role` (string): Role (only in first chunk)
- `finish_reason` (string|null): Reason for completion (`stop`, `length`, or `null` if ongoing)

**Processing Time**: Real-time streaming, first token typically within 1-2 seconds

**Status Codes**:
- `200`: Success (streaming response)
- `400`: Bad request (missing message)
- `500`: Server error

---

### 3. Standard Chat (Non-Streaming)

Send messages and receive the complete response at once. Best for batch processing or when streaming is not needed.

**Endpoint**: `POST /api/chat`

**Content-Type**: `application/json`

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `messages` | Array | Yes | - | Array of message objects (OpenAI format) |
| `temperature` | Float | No | 0.7 | Sampling temperature (0.0-2.0) |
| `max_tokens` | Integer | No | 2048 | Maximum tokens to generate |
| `top_p` | Float | No | 0.9 | Nucleus sampling parameter |

**Example Request (cURL)**:
```bash
curl -X POST http://140.143.183.163:38025/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What are the benefits of renewable energy?"}
    ],
    "temperature": 0.7
  }'
```

**Example Request (Python)**:
```python
import requests

url = "http://140.143.183.163:38025/api/chat"
data = {
    "messages": [
        {"role": "user", "content": "What are the benefits of renewable energy?"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048
}

response = requests.post(url, json=data)
result = response.json()
print(result['choices'][0]['message']['content'])
```

**Example Request (JavaScript)**:
```javascript
fetch('http://140.143.183.163:38025/api/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        messages: [
            { role: 'user', content: 'What are the benefits of renewable energy?' }
        ],
        temperature: 0.7,
        max_tokens: 2048
    })
})
.then(response => response.json())
.then(data => {
    console.log('Response:', data.choices[0].message.content);
});
```

**Response**:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1772912300,
  "model": "Qwen2.5-7B-Instruct",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Renewable energy offers numerous benefits including reduced carbon emissions, energy independence, lower long-term costs, and sustainable power generation..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 128,
    "total_tokens": 143
  }
}
```

**Response Fields**:
- `choices[0].message.content` (string): Complete generated text
- `choices[0].message.role` (string): Role ("assistant")
- `model` (string): Model name used
- `usage` (object): Token usage statistics
  - `prompt_tokens` (integer): Tokens in the input
  - `completion_tokens` (integer): Tokens in the output
  - `total_tokens` (integer): Total tokens used

**Processing Time**: Typically 2-10 seconds depending on response length

**Status Codes**:
- `200`: Success
- `400`: Bad request (missing message)
- `500`: Server error

---

### 4. OpenAI-Compatible Chat Completions

Standard OpenAI Chat Completions API format. Use this for drop-in replacement of OpenAI API.

**Endpoint**: `POST /v1/chat/completions`

**Content-Type**: `application/json`

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | String | Yes | - | Model name (use "Qwen2.5-7B-Instruct") |
| `messages` | Array | Yes | - | Array of message objects |
| `temperature` | Float | No | 0.7 | Sampling temperature (0.0-2.0) |
| `max_tokens` | Integer | No | 2048 | Maximum tokens to generate |
| `top_p` | Float | No | 0.9 | Nucleus sampling parameter |
| `stream` | Boolean | No | false | Enable streaming responses |

**Message Format**:
```json
{
  "role": "user" | "assistant" | "system",
  "content": "message text"
}
```

**Example Request (cURL)**:
```bash
curl -X POST http://140.143.183.163:38025/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen2.5-7B-Instruct",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is machine learning?"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048
  }'
```

**Example Request (Python with OpenAI SDK)**:
```python
from openai import OpenAI

# Point to local vLLM server
client = OpenAI(
    base_url="http://140.143.183.163:38025/v1",
    api_key="not-needed"  # vLLM doesn't require API key
)

response = client.chat.completions.create(
    model="Qwen2.5-7B-Instruct",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is machine learning?"}
    ],
    temperature=0.7,
    max_tokens=2048
)

print(response.choices[0].message.content)
```

**Example Request (JavaScript)**:
```javascript
fetch('http://140.143.183.163:38025/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        model: 'Qwen2.5-7B-Instruct',
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is machine learning?' }
        ],
        temperature: 0.7,
        max_tokens: 2048
    })
})
.then(response => response.json())
.then(data => {
    console.log(data.choices[0].message.content);
});
```

**Response**:
```json
{
  "id": "cmpl-abc123",
  "object": "chat.completion",
  "created": 1709856000,
  "model": "Qwen2.5-7B-Instruct",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Machine learning is a subset of artificial intelligence..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 150,
    "total_tokens": 175
  }
}
```

**Streaming Response** (when `stream: true`):
```
data: {"id":"cmpl-abc123","object":"chat.completion.chunk","created":1709856000,"model":"Qwen2.5-7B-Instruct","choices":[{"index":0,"delta":{"role":"assistant","content":"Machine"},"finish_reason":null}]}

data: {"id":"cmpl-abc123","object":"chat.completion.chunk","created":1709856000,"model":"Qwen2.5-7B-Instruct","choices":[{"index":0,"delta":{"content":" learning"},"finish_reason":null}]}

...

data: [DONE]
```

---

## Parameter Guidelines

### Temperature
Controls randomness in responses:
- `0.0-0.3`: Focused, deterministic (good for factual questions)
- `0.4-0.7`: Balanced creativity and coherence (recommended)
- `0.8-1.0`: More creative and diverse
- `1.1-2.0`: Very creative, may be less coherent

### Max Tokens
Maximum length of generated response:
- `256`: Short answers
- `512-1024`: Medium responses
- `2048`: Long, detailed responses (default)
- `4096`: Very long responses (use with caution)
- Model max: `8192` tokens

### Top P (Nucleus Sampling)
Alternative to temperature:
- `0.9`: Recommended default
- `0.95`: More diverse
- `0.8`: More focused
- Use either temperature OR top_p, not both

---

## Integration Examples

### Node.js/Express Integration

```javascript
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Streaming chat endpoint
app.post('/chat', async (req, res) => {
    try {
        const response = await axios.post(
            'http://140.143.183.163:38025/api/chat/stream',
            {
                message: req.body.message,
                temperature: req.body.temperature || 0.7
            },
            { responseType: 'stream' }
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        response.data.pipe(res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Non-streaming chat endpoint
app.post('/chat/simple', async (req, res) => {
    try {
        const response = await axios.post(
            'http://140.143.183.163:38025/api/chat',
            {
                message: req.body.message,
                temperature: req.body.temperature || 0.7
            }
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000);
```

### Python/Flask Integration

```python
from flask import Flask, request, jsonify, Response
import requests
import json

app = Flask(__name__)

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    """Streaming chat"""
    data = request.get_json()
    
    response = requests.post(
        'http://140.143.183.163:38025/api/chat/stream',
        json={
            'message': data.get('message'),
            'temperature': data.get('temperature', 0.7)
        },
        stream=True
    )
    
    def generate():
        for line in response.iter_lines():
            if line:
                yield line.decode('utf-8') + '\n'
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/chat', methods=['POST'])
def chat():
    """Non-streaming chat"""
    data = request.get_json()
    
    response = requests.post(
        'http://140.143.183.163:38025/api/chat',
        json={
            'message': data.get('message'),
            'temperature': data.get('temperature', 0.7)
        }
    )
    
    return jsonify(response.json())

if __name__ == '__main__':
    app.run(port=5000)
```

### React Frontend Integration

```jsx
import React, { useState, useRef, useEffect } from 'react';

function ChatInterface() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    // Streaming chat
    const handleSendStream = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        const assistantMessage = { role: 'assistant', content: '' };
        setMessages(prev => [...prev, assistantMessage]);

        try {
            const response = await fetch('http://140.143.183.163:38025/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: input,
                    temperature: 0.7
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const content = line.slice(6);
                        if (content === '[DONE]') break;
                        
                        try {
                            const data = JSON.parse(content);
                            setMessages(prev => {
                                const newMessages = [...prev];
                                newMessages[newMessages.length - 1].content += data.content;
                                return newMessages;
                            });
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Non-streaming chat
    const handleSendSimple = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('http://140.143.183.163:38025/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: input,
                    temperature: 0.7
                })
            });

            const data = await response.json();
            const assistantMessage = { role: 'assistant', content: data.response };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="chat-container">
            <div className="messages">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                        <strong>{msg.role}:</strong> {msg.content}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendStream}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message..."
                    disabled={loading}
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Sending...' : 'Send (Stream)'}
                </button>
                <button type="button" onClick={handleSendSimple} disabled={loading}>
                    Send (Simple)
                </button>
            </form>
        </div>
    );
}
```

---

## Rate Limiting & Best Practices

**Current Limits**:
- No hard rate limits currently enforced
- Recommended: Max 5 concurrent requests
- Processing time: 2-10 seconds per request

**Best Practices**:
1. **Use streaming for interactive UIs** - Better user experience
2. **Implement request queuing** for multiple concurrent requests
3. **Show typing indicators** during generation
4. **Handle connection timeouts** (set timeout to 60 seconds)
5. **Cache responses** when appropriate
6. **Validate input length** (max 8192 tokens including response)
7. **Use appropriate temperature** - Lower for factual, higher for creative

---

## Error Handling

**Common Errors**:

| Error | Cause | Solution |
|-------|-------|----------|
| `Messages array is required` | Missing or invalid messages parameter | Provide messages array in OpenAI format |
| `vLLM service unavailable` | vLLM not running | Contact administrator |
| `Connection timeout` | Request took too long | Retry with shorter max_tokens |
| `Invalid temperature` | Temperature out of range | Use 0.0-2.0 |
| `Context length exceeded` | Input + output > 8192 tokens | Reduce input or max_tokens |

**Error Response Format**:
```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

---

## System Architecture

```
┌─────────────┐
│   Client    │
│ Application │
└──────┬──────┘
       │ HTTP/HTTPS
       ↓
┌─────────────────────┐
│  Public Server      │
│  140.143.183.163    │
│  ├─ Nginx (SSL)     │
│  └─ FRP Server      │
└──────┬──────────────┘
       │ FRP Tunnel
       │ Port 38025
       ↓
┌─────────────────────┐
│  Campus Server      │
│  10.143.12.80       │
│  ├─ Node.js API     │
│  │  (Port 38025)    │
│  └─ vLLM Server     │
│     (Port 8000)     │
│     └─ Qwen2.5-7B   │
│        GPU 2        │
│        A100 40GB    │
└─────────────────────┘
```

**Components**:
- **Nginx**: SSL termination, reverse proxy (to be configured)
- **FRP**: Internal network penetration
- **Node.js**: API server, request handling, streaming
- **vLLM**: High-performance inference engine
- **Qwen2.5-7B-Instruct**: Conversational AI model

---

## Performance Metrics

**Hardware**:
- GPU: NVIDIA A100-SXM4-40GB (GPU 2)
- Model: Qwen2.5-7B-Instruct
- Inference Engine: vLLM 0.11.0
- VRAM Usage: ~14GB
- GPU Memory Utilization: 85%

**Benchmarks**:
- First Token Latency: 1-2 seconds
- Token Generation Speed: ~50-80 tokens/second
- Max Context Length: 8192 tokens
- Throughput: ~5-10 requests/minute (single GPU)
- Concurrent Requests: Up to 5 recommended

---

## Model Information

**Qwen2.5-7B-Instruct**:
- Parameters: 7 billion
- Context Length: 8192 tokens
- Languages: English, Chinese, and 27+ languages
- Training: Instruction-tuned for chat and Q&A
- Strengths: Reasoning, coding, mathematics, multilingual

**Capabilities**:
- General conversation and Q&A
- Code generation and explanation
- Mathematical problem solving
- Text summarization and analysis
- Creative writing
- Multilingual translation

**Limitations**:
- Knowledge cutoff: Training data up to 2023
- May generate incorrect information (hallucination)
- Not suitable for medical/legal advice
- Limited real-time information

---

## Changelog

### v1.0.0 (2026-03-08)
- Initial release
- Streaming chat API
- Non-streaming chat API
- OpenAI-compatible API
- Access code authentication
- Mobile responsive web interface
- vLLM backend with Qwen2.5-7B-Instruct

---

## Support & Contact

**Issues**: Report bugs or request features via GitHub Issues

**Documentation**: This file is maintained at `/home/Matrix/yz/AI-movie/llm-server/API_DOCUMENTATION.md`

**Model Information**:
- Qwen2.5: https://huggingface.co/Qwen/Qwen2.5-7B-Instruct
- vLLM: https://github.com/vllm-project/vllm

---

## License & Usage Terms

This API is provided for internal testing and development purposes.

**Restrictions**:
- Beta access only (access code required)
- No commercial use without permission
- Rate limits may be enforced
- Service availability not guaranteed

**Model License**: Qwen2.5 follows Apache 2.0 license

---

**End of Documentation**
