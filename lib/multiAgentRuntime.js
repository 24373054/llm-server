'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { randomUUID } = require('crypto');
const comfy = require('./comfyClient');

/** 与 ComfyUI `user/default/workflows/Flux2-s1-TtP1.json` 中 Distilled 子图等价的 API 图（非 UI JSON） */
const DEFAULT_WORKFLOW_RELATIVE = path.join(
    __dirname,
    '..',
    'workflow-templates',
    'flux2-klein-distilled-api.json'
);

function randomizeSeedsInWorkflow(w) {
    for (const id of Object.keys(w)) {
        const inputs = w[id]?.inputs;
        if (!inputs) {
            continue;
        }
        if (typeof inputs.noise_seed === 'number') {
            inputs.noise_seed = Math.floor(Math.random() * (2 ** 31 - 2)) + 1;
        }
        if (typeof inputs.seed === 'number') {
            inputs.seed = Math.floor(Math.random() * (2 ** 31 - 2)) + 1;
        }
    }
}

function applyLoaderNameOverrides(w) {
    const unet = process.env.COMFYUI_UNET_NAME?.trim();
    const clip = process.env.COMFYUI_CLIP_NAME?.trim();
    const vae = process.env.COMFYUI_VAE_NAME?.trim();
    for (const id of Object.keys(w)) {
        const node = w[id];
        if (!node?.class_type || !node.inputs) {
            continue;
        }
        if (unet && node.class_type === 'UNETLoader' && node.inputs.unet_name !== undefined) {
            node.inputs.unet_name = unet;
        }
        if (clip && node.class_type === 'CLIPLoader' && node.inputs.clip_name !== undefined) {
            node.inputs.clip_name = clip;
        }
        if (vae && node.class_type === 'VAELoader' && node.inputs.vae_name !== undefined) {
            node.inputs.vae_name = vae;
        }
    }
}

function vllmRoot(url) {
    return String(url || '').replace(/\/$/, '');
}

async function chatComplete(vllmUrl, model, messages, { temperature = 0.3, max_tokens = 1024 } = {}) {
    const res = await axios.post(
        `${vllmRoot(vllmUrl)}/v1/chat/completions`,
        {
            model,
            messages,
            temperature,
            max_tokens,
            stream: false,
        },
        { timeout: 300000 }
    );
    return res.data?.choices?.[0]?.message?.content?.trim() || '';
}

function extractJsonObject(s) {
    if (!s || typeof s !== 'string') {
        return null;
    }
    const start = s.indexOf('{');
    if (start < 0) {
        return null;
    }
    let depth = 0;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0) {
                return s.slice(start, i + 1);
            }
        }
    }
    return null;
}

function fallbackTasks(goal) {
    return [
        {
            id: 'w1',
            kind: 'llm',
            name: 'general',
            instruction: `用简洁中文回答用户需求：${goal}`,
        },
    ];
}

function normalizeTasks(parsed, goal, maxTasks) {
    const raw = parsed && Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const out = [];
    for (const t of raw) {
        if (out.length >= maxTasks) {
            break;
        }
        const id = String(t.id || `w${out.length + 1}`).slice(0, 32);
        const kind = t.kind === 'comfy' ? 'comfy' : 'llm';
        const name = String(t.name || id).slice(0, 64);
        const instruction = String(t.instruction || t.prompt || goal).slice(0, 4000);
        const positivePrompt = t.positivePrompt != null ? String(t.positivePrompt).slice(0, 2000) : '';
        out.push({ id, kind, name, instruction, positivePrompt });
    }
    return out.length ? out : fallbackTasks(goal);
}

async function planTasks(goal, model, vllmUrl, maxTasks, plannerMaxTokens) {
    const system = `你是任务规划器。用户会提出一个目标。你要把它拆成最多 ${maxTasks} 个可并行子任务。
每个子任务必须是 JSON 里的一项，字段如下：
- id: 短字符串，如 "a","b"
- kind: "llm" 或 "comfy"
- name: 角色名，如 researcher、writer
- instruction: 该子任务要产出的文字说明（中文或英文均可）
- positivePrompt: 仅当 kind 为 "comfy" 时必填，英文 Stable Diffusion 正面提示词

规则：
1. 只有用户明确要「出图 / 画图 / 文生图 / SD / Comfy」时才使用 kind "comfy"，否则全部用 "llm"。
2. 只输出一个 JSON 对象，不要 markdown，不要解释。格式：{"tasks":[...]}`;

    const user = `用户目标：\n${goal}`;
    let text;
    try {
        text = await chatComplete(vllmUrl, model, [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ], { temperature: 0.25, max_tokens: plannerMaxTokens });
    } catch (e) {
        return fallbackTasks(goal);
    }

    const jsonStr = extractJsonObject(text);
    if (!jsonStr) {
        return fallbackTasks(goal);
    }
    try {
        const parsed = JSON.parse(jsonStr);
        return normalizeTasks(parsed, goal, maxTasks);
    } catch {
        return fallbackTasks(goal);
    }
}

async function runLlmWorker(task, goal, model, vllmUrl, maxTokens) {
    const system = `你是多 Agent 系统里的一个专职工作者「${task.name}」。
只根据指令产出结果，不要重复用户整句目标（可简要引用）。输出简洁、分点亦可。`;
    const user = `总目标（供参考）：${goal}\n\n你的子任务：\n${task.instruction}`;
    const content = await chatComplete(
        vllmUrl,
        model,
        [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        { temperature: 0.4, max_tokens: maxTokens }
    );
    return { type: 'text', text: content };
}

async function runComfyWorker(task, comfyBase, workflowPath, positiveNodeId, _samplerNodeId, comfyTimeoutMs) {
    if (!comfyBase) {
        return { type: 'comfy', ok: false, error: '未配置 COMFYUI_BASE_URL' };
    }
    let workflow;
    try {
        workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    } catch (e) {
        return {
            type: 'comfy',
            ok: false,
            error: `无法读取工作流文件: ${workflowPath} (${e.message})`,
        };
    }

    const positive = (task.positivePrompt || task.instruction || 'abstract art').trim();
    const w = JSON.parse(JSON.stringify(workflow));
    const pNode = String(positiveNodeId);
    if (!w[pNode] || w[pNode].inputs?.text === undefined) {
        return { type: 'comfy', ok: false, error: `工作流缺少节点 ${pNode} 的 CLIP text` };
    }
    w[pNode].inputs.text = positive;

    applyLoaderNameOverrides(w);
    randomizeSeedsInWorkflow(w);

    const ckptOverride = process.env.COMFYUI_CHECKPOINT?.trim();
    const ckptNodeId = String(process.env.COMFYUI_CHECKPOINT_LOADER_NODE_ID || '4');
    if (ckptOverride && w[ckptNodeId]?.inputs?.ckpt_name !== undefined) {
        w[ckptNodeId].inputs.ckpt_name = ckptOverride;
    }

    let promptId;
    try {
        const q = await comfy.queuePrompt(comfyBase, w);
        promptId = q.prompt_id;
        if (!promptId) {
            return { type: 'comfy', ok: false, error: 'ComfyUI 未返回 prompt_id', raw: q };
        }
    } catch (e) {
        return { type: 'comfy', ok: false, error: e.message || String(e) };
    }

    const done = await comfy.waitForCompletion(comfyBase, promptId, { timeoutMs: comfyTimeoutMs });
    if (!done.ok) {
        return {
            type: 'comfy',
            ok: false,
            prompt_id: promptId,
            error: typeof done.error === 'string' ? done.error : JSON.stringify(done.error),
        };
    }

    return {
        type: 'comfy',
        ok: true,
        prompt_id: promptId,
        images: done.images,
        positive,
    };
}

function formatWorkerLine(task, result) {
    if (!result.ok) {
        return `- [${task.name}] (${task.kind}) 失败: ${result.error || 'unknown'}`;
    }
    const o = result.output;
    if (o?.type === 'comfy' && o.ok) {
        const imgs = o.images || [];
        const names = imgs.map((i) => i.filename).join(', ');
        return `- [${task.name}] (comfy) 已出图: ${names || '(无文件名)'}`;
    }
    if (o?.type === 'text') {
        return `- [${task.name}] (llm)\n${o.text}`;
    }
    return `- [${task.name}] 未知输出`;
}

async function runAggregate(goal, tasks, workerResults, model, vllmUrl, maxTokens) {
    const lines = tasks.map((t, i) => formatWorkerLine(t, workerResults[i]));
    const bundle = lines.join('\n\n');
    const system = `你是主控 Agent。请根据各并行工作者的结果，用中文写一份连贯的最终答复给用户。
要求：覆盖要点、结构清晰；若某子任务失败，简要说明并给出仍可信的部分；不要编造未提供的事实。`;
    const user = `用户目标：\n${goal}\n\n各工作者输出：\n${bundle}`;
    return chatComplete(
        vllmUrl,
        model,
        [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        { temperature: 0.35, max_tokens: maxTokens }
    );
}

/**
 * Supervisor 规划 → 并行 Workers（llm / comfy）→ 汇总
 */
async function executeMultiAgentRun(options) {
    const {
        goal,
        getModelId,
        vllmUrl,
        comfyBase,
        workflowPath = process.env.COMFYUI_WORKFLOW_PATH || DEFAULT_WORKFLOW_RELATIVE,
        positiveNodeId = process.env.COMFYUI_POSITIVE_NODE_ID || '4',
        samplerNodeId = process.env.COMFYUI_SAMPLER_NODE_ID || '9',
        maxTasks = Math.min(
            parseInt(process.env.MAX_AGENT_TASKS || '4', 10) || 4,
            8
        ),
        plannerMaxTokens = parseInt(process.env.AGENT_PLANNER_MAX_TOKENS || '512', 10) || 512,
        workerMaxTokens = parseInt(process.env.AGENT_WORKER_MAX_TOKENS || '768', 10) || 768,
        aggregateMaxTokens = parseInt(process.env.AGENT_AGGREGATE_MAX_TOKENS || '2048', 10) || 2048,
        comfyTimeoutMs = parseInt(process.env.COMFYUI_JOB_TIMEOUT_MS || '600000', 10) || 600000,
        onEvent,
    } = options;

    const runId = randomUUID();
    const model = await getModelId();
    onEvent?.('meta', { run_id: runId, model });

    onEvent?.('phase', { phase: 'plan' });
    const tasks = await planTasks(goal, model, vllmUrl, maxTasks, plannerMaxTokens);
    onEvent?.('plan', { tasks });

    onEvent?.('phase', { phase: 'workers_parallel' });
    const workerResults = await Promise.all(
        tasks.map(async (task) => {
            onEvent?.('worker_start', {
                id: task.id,
                name: task.name,
                kind: task.kind,
            });
            try {
                let output;
                if (task.kind === 'comfy') {
                    output = await runComfyWorker(
                        task,
                        comfyBase,
                        workflowPath,
                        positiveNodeId,
                        samplerNodeId,
                        comfyTimeoutMs
                    );
                    if (!output.ok) {
                        const err = output.error || 'ComfyUI 执行失败';
                        const pack = { id: task.id, ok: false, error: err };
                        onEvent?.('worker_done', {
                            id: task.id,
                            name: task.name,
                            kind: task.kind,
                            ok: false,
                            error: err,
                            output,
                        });
                        return pack;
                    }
                } else {
                    output = await runLlmWorker(task, goal, model, vllmUrl, workerMaxTokens);
                }
                const pack = { id: task.id, ok: true, output };
                onEvent?.('worker_done', {
                    id: task.id,
                    name: task.name,
                    kind: task.kind,
                    ok: true,
                    output,
                });
                return pack;
            } catch (e) {
                const err = e.message || String(e);
                const pack = { id: task.id, ok: false, error: err };
                onEvent?.('worker_done', {
                    id: task.id,
                    name: task.name,
                    kind: task.kind,
                    ok: false,
                    error: err,
                });
                return pack;
            }
        })
    );

    onEvent?.('phase', { phase: 'aggregate' });
    const aggregate = await runAggregate(
        goal,
        tasks,
        workerResults,
        model,
        vllmUrl,
        aggregateMaxTokens
    );
    onEvent?.('aggregate', { content: aggregate });

    return {
        run_id: runId,
        model,
        tasks,
        workers: workerResults,
        aggregate,
    };
}

module.exports = {
    executeMultiAgentRun,
    DEFAULT_WORKFLOW_RELATIVE,
};
