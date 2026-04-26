const express = require('express');
const axios = require('axios');
const os = require('os');
const comfy = require('./lib/comfyClient');
const { executeMultiAgentRun } = require('./lib/multiAgentRuntime');

const app = express();

const PORT = parseInt(process.env.LLM_SERVER_PORT || '38025', 10);
const VLLM_URL = (process.env.VLLM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const COMFYUI_BASE_URL = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');

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

/** JSON 与 API 必须在 static 之前，避免旧版/静态托管边界导致 POST 未命中路由 */
app.use(express.json());

app.get('/api/health', async (req, res) => {
    let vllmOk = false;
    try {
        await axios.get(`${VLLM_URL}/health`, { timeout: 5000 });
        vllmOk = true;
    } catch {
        vllmOk = false;
    }
    const comfyOk = await comfy.checkComfyReachable(COMFYUI_BASE_URL);
    const payload = {
        status: vllmOk ? 'ok' : 'degraded',
        vllm: vllmOk ? 'connected' : 'disconnected',
        vllm_base: VLLM_URL,
        comfyui: comfyOk ? 'connected' : 'disconnected',
        comfyui_base: COMFYUI_BASE_URL,
    };
    if (!vllmOk) {
        return res.status(503).json({ ...payload, status: 'error' });
    }
    res.json(payload);
});

/** 自检：ComfyUI 是否可达 + 当前队列（仅用 /queue，避免 object_info 超大 JSON） */
app.get('/api/comfy/status', async (req, res) => {
    const base = comfy.base(COMFYUI_BASE_URL);
    const out = {
        comfyui_base: COMFYUI_BASE_URL,
        reachable: false,
        queue: null,
        workflow_template:
            process.env.COMFYUI_WORKFLOW_PATH ||
            '(默认 llm-server/workflow-templates/minimal_txt2img_api.json)',
        checkpoint_override: process.env.COMFYUI_CHECKPOINT || null,
    };
    try {
        const qr = await axios.get(`${base}/queue`, { timeout: 5000 });
        out.queue = qr.data;
        out.reachable = true;
    } catch {
        out.reachable = false;
    }
    res.json(out);
});

/** 代理 ComfyUI 出图，避免浏览器跨端口取图被 CORS 拦 */
app.get('/api/comfy/view', async (req, res) => {
    const { filename, subfolder = '', type = 'output' } = req.query;
    if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'query filename is required' });
    }
    try {
        const r = await axios.get(`${comfy.base(COMFYUI_BASE_URL)}/view`, {
            params: { filename, subfolder, type },
            responseType: 'stream',
            timeout: 120000,
            validateStatus: () => true,
        });
        if (r.status >= 400) {
            return res.status(502).json({ error: `ComfyUI view HTTP ${r.status}` });
        }
        const ct = r.headers['content-type'];
        if (ct) {
            res.setHeader('Content-Type', ct);
        }
        r.data.pipe(res);
    } catch (error) {
        if (!res.headersSent) {
            res.status(502).json({ error: error.message || 'comfy view proxy failed' });
        }
    }
});

function writeSse(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 多 Agent：规划 → 并行（vLLM 子调用 + ComfyUI 出图）→ 汇总（非 OpenAI 格式 SSE） */
const agentStreamHandler = async (req, res) => {
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
    if (!goal) {
        return res.status(400).json({ error: 'goal (string) is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    try {
        await executeMultiAgentRun({
            goal,
            getModelId,
            vllmUrl: VLLM_URL,
            comfyBase: COMFYUI_BASE_URL,
            onEvent: (ev, data) => writeSse(res, ev, data),
        });
        writeSse(res, 'done', {});
    } catch (error) {
        console.error('agent stream:', error.message);
        try {
            writeSse(res, 'error', { message: error.message || String(error) });
        } catch {
            /* ignore */
        }
    }
    res.end();
};

app.post('/api/agent/stream', agentStreamHandler);
app.post('/api/agent/stream/', agentStreamHandler);

const agentRunHandler = async (req, res) => {
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
    if (!goal) {
        return res.status(400).json({ error: 'goal (string) is required' });
    }
    try {
        const out = await executeMultiAgentRun({
            goal,
            getModelId,
            vllmUrl: VLLM_URL,
            comfyBase: COMFYUI_BASE_URL,
        });
        res.json(out);
    } catch (error) {
        console.error('agent run:', error.message);
        res.status(500).json({ error: error.message || String(error) });
    }
};

app.post('/api/agent/run', agentRunHandler);
app.post('/api/agent/run/', agentRunHandler);

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

app.use(express.static('public'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=== LLM Chat Server (vLLM 代理) ===');
    console.log(`本机: http://127.0.0.1:${PORT}`);
    console.log(`局域网 IP: ${localAddresses()}`);
    console.log(`vLLM: ${VLLM_URL}`);
    console.log(`ComfyUI: ${COMFYUI_BASE_URL}（多 Agent comfy 子任务）`);
    if (process.env.COMFYUI_CHECKPOINT) {
        console.log(`ComfyUI checkpoint 覆盖: ${process.env.COMFYUI_CHECKPOINT}`);
    }
    console.log(`模型: ${resolvedModelId || '(启动后首次对话从 /v1/models 自动解析)'}`);
    console.log('===================================\n');
});
