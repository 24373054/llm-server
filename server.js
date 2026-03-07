const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 38025;
const VLLM_URL = 'http://127.0.0.1:8000'; // vLLM服务地址

// 静态文件服务
app.use(express.static('public'));
app.use(express.json());

// 健康检查
app.get('/api/health', async (req, res) => {
    try {
        const response = await axios.get(`${VLLM_URL}/health`, { timeout: 5000 });
        res.json({ status: 'ok', vllm: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', vllm: 'disconnected' });
    }
});

// 获取模型信息
app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`${VLLM_URL}/v1/models`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

// 对话API（流式）
app.post('/api/chat/stream', async (req, res) => {
    try {
        const { messages, temperature = 0.7, max_tokens = 2048, top_p = 0.9 } = req.body;
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        // 设置SSE响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await axios.post(
            `${VLLM_URL}/v1/chat/completions`,
            {
                model: 'Qwen2.5-7B-Instruct',
                messages: messages,
                temperature: temperature,
                max_tokens: max_tokens,
                top_p: top_p,
                stream: true
            },
            {
                responseType: 'stream',
                timeout: 300000 // 5分钟超时
            }
        );

        // 转发流式响应
        response.data.on('data', (chunk) => {
            res.write(chunk);
        });

        response.data.on('end', () => {
            res.end();
        });

        response.data.on('error', (error) => {
            console.error('Stream error:', error);
            res.end();
        });

    } catch (error) {
        console.error('Chat error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to process chat',
                details: error.message 
            });
        }
    }
});

// 对话API（非流式）
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, temperature = 0.7, max_tokens = 2048, top_p = 0.9 } = req.body;
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const response = await axios.post(
            `${VLLM_URL}/v1/chat/completions`,
            {
                model: 'Qwen2.5-7B-Instruct',
                messages: messages,
                temperature: temperature,
                max_tokens: max_tokens,
                top_p: top_p,
                stream: false
            },
            {
                timeout: 300000
            }
        );

        res.json(response.data);

    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ 
            error: 'Failed to process chat',
            details: error.message 
        });
    }
});

// OpenAI兼容API - 直接代理到vLLM
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { stream = false } = req.body;

        if (stream) {
            // 流式响应
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await axios.post(
                `${VLLM_URL}/v1/chat/completions`,
                req.body,
                {
                    responseType: 'stream',
                    timeout: 300000
                }
            );

            response.data.pipe(res);
        } else {
            // 非流式响应
            const response = await axios.post(
                `${VLLM_URL}/v1/chat/completions`,
                req.body,
                {
                    timeout: 300000
                }
            );

            res.json(response.data);
        }

    } catch (error) {
        console.error('OpenAI API error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to process request',
                details: error.message 
            });
        }
    }
});

// 获取模型列表 - OpenAI兼容
app.get('/v1/models', async (req, res) => {
    try {
        const response = await axios.get(`${VLLM_URL}/v1/models`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== LLM Chat Server ===`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://10.143.12.80:${PORT}`);
    console.log(`vLLM: ${VLLM_URL}`);
    console.log(`=======================\n`);
});
