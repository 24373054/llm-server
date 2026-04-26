'use strict';

const axios = require('axios');
const { randomUUID } = require('crypto');

function base(baseUrl) {
    return String(baseUrl || '').replace(/\/$/, '');
}

/**
 * POST /prompt — ComfyUI API 格式 workflow（与界面「Export (API)」一致）
 */
async function queuePrompt(comfyBase, prompt, clientId) {
    const url = `${base(comfyBase)}/prompt`;
    const body = {
        prompt,
        client_id: clientId || randomUUID(),
    };
    const res = await axios.post(url, body, {
        timeout: 120000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
    });
    if (res.status >= 400) {
        const msg = res.data?.error || res.data?.message || JSON.stringify(res.data);
        throw new Error(`ComfyUI /prompt HTTP ${res.status}: ${msg}`);
    }
    return res.data;
}

async function getHistory(comfyBase, promptId) {
    const url = `${base(comfyBase)}/history/${encodeURIComponent(promptId)}`;
    const res = await axios.get(url, { timeout: 60000, validateStatus: () => true });
    if (res.status >= 400) {
        throw new Error(`ComfyUI /history/${promptId} HTTP ${res.status}`);
    }
    return res.data;
}

function extractOutputImages(historyEntry) {
    const images = [];
    if (!historyEntry || !historyEntry.outputs) {
        return images;
    }
    for (const nodeId of Object.keys(historyEntry.outputs)) {
        const out = historyEntry.outputs[nodeId];
        if (out.images && Array.isArray(out.images)) {
            for (const img of out.images) {
                images.push({
                    filename: img.filename,
                    subfolder: img.subfolder || '',
                    type: img.type || 'output',
                });
            }
        }
    }
    return images;
}

/**
 * 轮询直到 history 中出现 outputs，或超时 / 明确错误
 */
async function waitForCompletion(comfyBase, promptId, opts) {
    const timeoutMs = opts?.timeoutMs ?? 600000;
    const intervalMs = opts?.intervalMs ?? 400;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const h = await getHistory(comfyBase, promptId);
        const entry = h[promptId];
        if (entry && entry.outputs && Object.keys(entry.outputs).length > 0) {
            return {
                ok: true,
                entry,
                images: extractOutputImages(entry),
            };
        }
        const st = entry?.status;
        if (st && String(st.status_str || '').toLowerCase() === 'error') {
            return {
                ok: false,
                error: st.messages || st.exception || 'ComfyUI execution error',
            };
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { ok: false, error: 'timeout waiting for ComfyUI completion' };
}

async function checkComfyReachable(comfyBase) {
    try {
        const res = await axios.get(`${base(comfyBase)}/queue`, { timeout: 4000 });
        return res.status === 200;
    } catch {
        return false;
    }
}

module.exports = {
    queuePrompt,
    getHistory,
    waitForCompletion,
    extractOutputImages,
    checkComfyReachable,
    base,
};
