// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const accessCodeInput = document.getElementById('accessCode');
const submitCodeBtn = document.getElementById('submitCode');
const errorMessage = document.getElementById('errorMessage');
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const status = document.getElementById('status');
const multiAgentMode = document.getElementById('multiAgentMode');

// 内测码验证
const ACCESS_CODE = 'llm2025';
const AUTH_KEY = 'llm_auth_token';

let conversationHistory = [];
let isProcessing = false;
let markedOptionsApplied = false;

function renderMarkdown(text) {
    if (text == null || text === '') {
        return '';
    }
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
    try {
        if (!markedOptionsApplied && typeof marked.use === 'function') {
            marked.use({ breaks: true, gfm: true });
            markedOptionsApplied = true;
        }
        const raw = marked.parse(text);
        return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    } catch (e) {
        console.warn('markdown parse', e);
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
}

function checkAuth() {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token === ACCESS_CODE) {
        authOverlay.classList.add('hidden');
        return true;
    }
    return false;
}

submitCodeBtn.addEventListener('click', () => {
    const code = accessCodeInput.value.trim();
    if (code === ACCESS_CODE) {
        sessionStorage.setItem(AUTH_KEY, code);
        authOverlay.classList.add('hidden');
        errorMessage.classList.add('hidden');
        checkHealth();
    } else {
        errorMessage.classList.remove('hidden');
        accessCodeInput.value = '';
        accessCodeInput.focus();
    }
});

accessCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitCodeBtn.click();
    }
});

if (!checkAuth()) {
    accessCodeInput.focus();
}

// Check server health
async function checkHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (data.status === 'ok') {
            status.classList.add('online');
            status.classList.remove('offline');
            const comfyPart =
                data.comfyui === 'connected' ? ' · Comfy' : data.comfyui === 'disconnected' ? ' · Comfy 离线' : '';
            status.querySelector('.text').textContent = `Ready${comfyPart}`;
        } else {
            throw new Error('Service unavailable');
        }
    } catch (error) {
        status.classList.add('offline');
        status.classList.remove('online');
        status.querySelector('.text').textContent = 'Offline';
    }
}

async function consumeCustomSse(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let streamDone = false;
    while (!streamDone) {
        const { done, value } = await reader.read();
        streamDone = !!done;
        buf += decoder.decode(value || new Uint8Array(), { stream: !streamDone });
        buf = buf.replace(/\r\n/g, '\n');
        for (;;) {
            const idx = buf.indexOf('\n\n');
            if (idx < 0) {
                break;
            }
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let ev = 'message';
            const dataLines = [];
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) {
                    ev = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }
            const raw = dataLines.join('\n');
            if (!raw) {
                continue;
            }
            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                data = raw;
            }
            await onEvent(ev, data);
        }
    }
}

async function runMultiAgentFlow(goal, assistantMessage) {
    let tasksPreview = '';
    let completedMd = '';
    let aggregate = '';
    let fatal = null;
    let finalMd = '';

    const rebuild = () => {
        let md = '';
        if (tasksPreview) {
            md += '## 任务规划\n\n' + tasksPreview + '\n\n---\n\n';
        }
        if (completedMd) {
            md += '## 子任务结果\n\n' + completedMd + '\n\n---\n\n';
        }
        md += '## 汇总\n\n' + (aggregate || '_正在生成汇总…_');
        finalMd = md;
        assistantMessage.classList.remove('typing');
        updateMessage(assistantMessage, md);
    };

    const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
    });
    if (!response.ok) {
        let detail = '';
        try {
            detail = await response.text();
        } catch {
            /* ignore */
        }
        throw new Error(detail || `HTTP ${response.status}`);
    }

    await consumeCustomSse(response, (ev, data) => {
        if (ev === 'plan' && data.tasks && Array.isArray(data.tasks)) {
            tasksPreview = data.tasks
                .map((t) => {
                    const ins = (t.instruction || '').slice(0, 160);
                    const ell = (t.instruction || '').length > 160 ? '…' : '';
                    return `- **${t.name}**（\`${t.kind}\`）${ins}${ell}`;
                })
                .join('\n');
            rebuild();
        }
        if (ev === 'worker_done') {
            if (data.ok && data.output?.type === 'comfy') {
                const imgsList = data.output.images || [];
                if (imgsList.length) {
                    let imgs = '';
                    for (const im of imgsList) {
                        const u =
                            '/api/comfy/view?filename=' +
                            encodeURIComponent(im.filename) +
                            '&subfolder=' +
                            encodeURIComponent(im.subfolder || '') +
                            '&type=' +
                            encodeURIComponent(im.type || 'output');
                        imgs += `\n\n![](${u})`;
                    }
                    completedMd += `### ${data.name}（comfy）\n\n出图完成。${imgs}\n\n`;
                } else {
                    const pid = data.output.prompt_id ? `\`prompt_id\`: \`${data.output.prompt_id}\`` : '';
                    completedMd += `### ${data.name}（comfy）\n\n已完成但未解析到图片输出。${pid}\n\n`;
                }
            } else if (data.ok && data.output?.type === 'text') {
                completedMd += `### ${data.name}（llm）\n\n${data.output.text}\n\n`;
            } else {
                completedMd += `### ${data.name}\n\n**失败:** ${data.error || 'unknown'}\n\n`;
            }
            rebuild();
        }
        if (ev === 'aggregate' && data.content != null) {
            aggregate = data.content;
            rebuild();
        }
        if (ev === 'error') {
            fatal = data.message || (typeof data === 'string' ? data : JSON.stringify(data));
        }
    });

    if (fatal) {
        throw new Error(fatal);
    }
    return finalMd;
}

// Add message to chat
function addMessage(role, content, isTyping = false, roleLabel) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}${isTyping ? ' typing' : ''}`;
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    roleDiv.textContent =
        roleLabel != null ? roleLabel : role === 'user' ? 'You' : 'Assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const body = document.createElement('div');
    if (role === 'assistant') {
        body.className = 'md-body';
        body.innerHTML = renderMarkdown(content);
    } else {
        body.className = 'msg-plain';
        body.textContent = content;
    }
    contentDiv.appendChild(body);
    
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageDiv;
}

// Update message content（助手：实时 Markdown；用户：纯文本）
function updateMessage(messageDiv, content) {
    const inner = messageDiv.querySelector('.md-body') || messageDiv.querySelector('.msg-plain') || messageDiv.querySelector('.message-content p');
    if (!inner) return;
    if (messageDiv.classList.contains('assistant') && inner.classList.contains('md-body')) {
        inner.innerHTML = renderMarkdown(content);
    } else {
        inner.textContent = content;
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send message
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || isProcessing) return;
    
    // Add user message
    addMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });
    
    // Clear input
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // Disable input
    isProcessing = true;
    sendBtn.disabled = true;
    userInput.disabled = true;
    
    const useMultiAgent = multiAgentMode && multiAgentMode.checked;
    const assistantMessage = useMultiAgent
        ? addMessage('assistant', '_多 Agent 运行中…_', true, '多 Agent')
        : addMessage('assistant', 'Thinking...', true);
    let assistantContent = '';

    try {
        if (useMultiAgent) {
            assistantContent = await runMultiAgentFlow(message, assistantMessage);
            conversationHistory.push({ role: 'assistant', content: assistantContent });
        } else {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: conversationHistory,
                    temperature: 0.7,
                    max_tokens: 2048,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                sseBuffer += decoder.decode(value, { stream: !done });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trimEnd();
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const delta = json.choices[0]?.delta?.content;
                        if (delta) {
                            assistantContent += delta;
                            assistantMessage.classList.remove('typing');
                            updateMessage(assistantMessage, assistantContent);
                        }
                    } catch (e) {
                        // 半行 JSON 已由 sseBuffer 承接；其余忽略
                    }
                }
                if (done) break;
            }

            conversationHistory.push({ role: 'assistant', content: assistantContent });
        }
    } catch (error) {
        console.error('Error:', error);
        const msg = (error && error.message) || String(error);
        updateMessage(
            assistantMessage,
            useMultiAgent ? `**请求失败**\n\n\`${msg}\`` : 'Sorry, I encountered an error. Please try again.'
        );
        assistantMessage.classList.remove('typing');
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
});

// Initialize
if (checkAuth()) {
    checkHealth();
    setInterval(checkHealth, 30000);
}
