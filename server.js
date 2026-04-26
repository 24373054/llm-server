const express = require('express');
const axios = require('axios');
const os = require('os');

const app = express();

const PORT = parseInt(process.env.LLM_SERVER_PORT || '38025', 10);
const VLLM_URL = (process.env.VLLM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

/** vLLM 的 served_model_name；不设置则在首次请求时从 GET /v1/models 取第一个 */
let resolvedModelId = (process.env.VLLM_MODEL || '').trim();

async function getModelId() {
    if (resolvedModelId) {
        return resolvedModelId;
    }
    const response = await axios.get(`${VLLM_URL}/v1/models`, { timeout: 10000 });
    const id = response.data?.data?.[0]?.id;
    if (!id) {
        throw new Error('vLLM /v1/models 未返回可用 model id，请设置环境变量 VLLM_MODEL');
    }
    resolvedModelId = id;
    return resolvedModelId;
}

function localAddresses() {
    const nets = os.networkInterfaces();
    const out = [];
    for (const addrs of Object.values(nets)) {
        for (const a of addrs || []) {
            if (a.family === 'IPv4' && !a.internal) {
                out.push(a.address);
            }
        }
    }
    return out.length ? out.join(', ') : '(仅本机)';
}

app.use(express.static('public'));
app.use(express.json());

app.get('/api/health', async (req, res) => {
    try {
        await axios.get(`${VLLM_URL}/health`, { timeout: 5000 });
        res.json({ status: 'ok', vllm: 'connected', vllm_base: VLLM_URL });
    } catch (error) {
        res.status(503).json({ status: 'error', vllm: 'disconnected', vllm_base: VLLM_URL });
    }
});

app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`${VLLM_URL}/v1/models`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

app.post('/api/chat/stream', async (req, res) => {
    try {
        const { messages, temperature = 0.7, max_tokens = 2048, top_p = 0.9, model: bodyModel } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const model = bodyModel || (await getModelId());

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await axios.post(
            `${VLLM_URL}/v1/chat/completions`,
            {
                model,
                messages,
                temperature,
                max_tokens,
                top_p,
                stream: true,
            },
            {
                responseType: 'stream',
                timeout: 300000,
            }
        );

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
                details: error.message,
            });
        }
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, temperature = 0.7, max_tokens = 2048, top_p = 0.9, model: bodyModel } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const model = bodyModel || (await getModelId());

        const response = await axios.post(
            `${VLLM_URL}/v1/chat/completions`,
            {
                model,
                messages,
                temperature,
                max_tokens,
                top_p,
                stream: false,
            },
            {
                timeout: 300000,
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({
            error: 'Failed to process chat',
            details: error.message,
        });
    }
});

app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { stream = false } = req.body;

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await axios.post(`${VLLM_URL}/v1/chat/completions`, req.body, {
                responseType: 'stream',
                timeout: 300000,
            });

            response.data.pipe(res);
        } else {
            const response = await axios.post(`${VLLM_URL}/v1/chat/completions`, req.body, {
                timeout: 300000,
            });
            res.json(response.data);
        }
    } catch (error) {
        console.error('OpenAI API error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to process request',
                details: error.message,
            });
        }
    }
});

app.get('/v1/models', async (req, res) => {
    try {
        const response = await axios.get(`${VLLM_URL}/v1/models`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=== LLM Chat Server (vLLM 代理) ===');
    console.log(`本机: http://127.0.0.1:${PORT}`);
    console.log(`局域网 IP: ${localAddresses()}`);
    console.log(`vLLM: ${VLLM_URL}`);
    console.log(`模型: ${resolvedModelId || '(启动后首次对话从 /v1/models 自动解析)'}`);
    console.log('===================================\n');
});
