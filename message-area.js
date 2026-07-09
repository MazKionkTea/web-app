// ============================================================
// Konfigurasi RAG endpoint
// ============================================================
const RAG_SERVER = `http://${window.location.hostname}:8001`;
const RAG_ENDPOINT = `${RAG_SERVER}/chat-with-rag`;


// ============================================================
// Fungsi clone template + isi data + pasang event listener
// ============================================================
function createMessageFromTemplate(templateId, options = {}) {
    const template = document.getElementById(templateId);
    if (!template) {
        console.error('Template not found:', templateId);
        return null;
    }
    
    const clone = template.content.firstElementChild.cloneNode(true);
    
    // Isi konten pesan
    if (options.content) {
        clone.dataset.content = options.content;
    }
    if (options.html) {
        const contentEl = clone.querySelector('.message-content');
        if (contentEl) contentEl.innerHTML = options.html;
    }
    
    // Isi waktu
    if (options.time) {
        const timeEl = clone.querySelector('.message-time');
        if (timeEl) timeEl.textContent = options.time;
    }
    
    // Isi message ID
    if (options.messageId) {
        clone.dataset.messageId = options.messageId;
    }
    
    // Pasang event listener ke tombol
    const buttons = clone.querySelectorAll('.msg-action-btn');
    const actions = options.actions || {};
    
    buttons.forEach(btn => {
        const title = btn.getAttribute('title');
        
        if (title === 'Edit' && actions.onEdit) {
            btn.onclick = actions.onEdit;
        } else if (title === 'Copy' && actions.onCopy) {
            btn.onclick = actions.onCopy;
        } else if (title === 'Branch' && actions.onBranch) {
            btn.onclick = actions.onBranch;
        } else if (title === 'Delete' && actions.onDelete) {
            btn.onclick = actions.onDelete;
        } else if (title === 'Regenerate' && actions.onRegenerate) {
            btn.onclick = actions.onRegenerate;
        }
    });
    
    return clone;
}


function updateInfoBar(aiMessage, data) {
    const infoBar = aiMessage.querySelector('.info-bar');
    if (!infoBar) return;
    
    // Model name
    const nameEl = infoBar.querySelector('.info-model-name');
    if (nameEl && data.modelName) nameEl.textContent = data.modelName;
    
    // Model size
    const sizeEl = infoBar.querySelector('.info-size');
    if (sizeEl && data.modelSize) sizeEl.textContent = data.modelSize;
    
    // Quantization
    const quantEl = infoBar.querySelector('.info-quant');
    if (quantEl && data.modelQuant) quantEl.textContent = data.modelQuant;
    
    // Tokens
    const tokensEl = infoBar.querySelector('.info-tokens');
    if (tokensEl) tokensEl.textContent = data.tokens || '0';
    
    // Time
    const timeEl = infoBar.querySelector('.info-time');
    if (timeEl) timeEl.textContent = (data.time || '0') + 's';
    
    // Speed
    const speedEl = infoBar.querySelector('.info-speed');
    if (speedEl) speedEl.textContent = data.speed || '0';
}


// Masukkan ke messagesArea
// const area = document.getElementById('messagesArea');
// area.classList.remove('hidden');
// area.appendChild(msg);

// ============================================================
// Helper: tentukan endpoint dan body request
// ============================================================
function getRequestConfig() {
    const useRAG = state.uploadedFileId ? true : false;
    
    if (useRAG) {
        return {
            endpoint: RAG_ENDPOINT,
            body: JSON.stringify({ 
                messages: state.messages,
                file_id: state.uploadedFileId,
                top_k: 3, 
                temperature: 0.7, 
                max_tokens: 4096 
            }),
            isStreaming: false
        };
    } else {
        return {
            endpoint: CHAT_ENDPOINT,
            body: JSON.stringify({ 
                model: 'local-model', 
                messages: state.messages, 
                stream: true, 
                temperature: 0.7, 
                max_tokens: 4096 
            }),
            isStreaming: true
        };
    }
}


// ============================================================
// Helper: handle response (streaming atau non-streaming)
// ============================================================
async function handleAIResponse(response, isStreaming, aiTextEl, signal, messagesArea) {
    let fullResponse = '';
    
    if (!isStreaming) {
        // Non-streaming (RAG mode)
        const data = await response.json();
        fullResponse = data.answer || 'Maaf, tidak ada jawaban.';
        
        if (data.sources && data.sources.length > 0) {
            fullResponse += '\n\n---\n📚 **Referensi:**\n';
            data.sources.forEach((src) => {
                fullResponse += `- \`${src.file}\` (${src.chunk_name || 'chunk'}, relevansi: ${(src.similarity * 100).toFixed(0)}%)\n`;
            });
        }
        
        aiTextEl.innerHTML = renderMarkdown(fullResponse);
        if (typeof hljs !== 'undefined') {
            aiTextEl.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
        
    } else {
        // Streaming (chat biasa)
        if (!response.body) throw new Error('Streaming not supported');
        
        currentStreamReader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        showStatus('AI is thinking...', 'connecting');
        
        try {
            while (true) {
                if (signal.aborted) break;
                const { done, value } = await currentStreamReader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                
                for (const line of lines) {
                    if (signal.aborted) break;
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue;
                    
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        if (json.error) throw new Error(json.error);
                        const delta = json.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullResponse += delta;
                            aiTextEl.innerHTML = renderMarkdown(fullResponse);
                            messagesArea.scrollTop = messagesArea.scrollHeight;
                            if (typeof hljs !== 'undefined') {
                                aiTextEl.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                            }
                        }
                    } catch (e) { if (e.message.includes('error')) throw e; }
                }
            }
        } finally {
            if (currentStreamReader) { currentStreamReader.releaseLock(); currentStreamReader = null; }
            generationAbortController = null;
        }
    }
    
    return fullResponse;
}


// ============================================================
// [Elemen UI: chat area] Fungsi utama untuk mengirim pesan ke AI
// ============================================================
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text && !state.uploadedFile) return;
    if (state.isTyping) return;
    
    document.getElementById('welcomeScreen').classList.add('hidden');
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.classList.remove('hidden');

    let userContent = text;
    if (state.uploadedFile) userContent += `\n\n[Attached file: ${escapeHtml(state.uploadedFile.name)}]`;

    let displayContent = renderMarkdown(text);
    if (state.uploadedFile) {
        displayContent += `<br><small style="opacity:0.8"><i class="fas fa-paperclip"></i> ${escapeHtml(state.uploadedFile.name)}</small>`;
    }

    const userMessage = createMessageFromTemplate('userMessageTemplate', {
        messageId: 'msg_' + Date.now(),
        content: userContent,
        html: displayContent,
        time: new Date().toLocaleTimeString(),
        actions: {
            onEdit: function() { editMessage(this); },
            onCopy: function() { copyMessage(this); },
            onDelete: function() { deleteMessage(this); }
        }
    });

    messagesArea.appendChild(userMessage);
    state.messages.push({ role: 'user', content: userContent });

    input.value = '';
    input.style.height = 'auto';
    messagesArea.scrollTop = messagesArea.scrollHeight;

    if (!state.currentChatId) state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    state.isTyping = true; 
    updateSendButtonState();
    showStatus('Connecting to AI...', 'connecting');

    const aiMessage = createMessageFromTemplate('aiMessageTemplate', {
        time: '',
        actions: {
            onRegenerate: function() { regenerateMessage(this); },
            onCopy: function() { copyMessage(this); },
            onDelete: function() { deleteMessage(this); }
        }
    });
    messagesArea.appendChild(aiMessage);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    const aiTextEl = aiMessage.querySelector('.message-content');
    const aiTimeEl = aiMessage.querySelector('.message-time');

    generationAbortController = new AbortController();
    const signal = generationAbortController.signal;
    let fullResponse = '';
    const startTime = Date.now();

    try {
        const { endpoint, body, isStreaming } = getRequestConfig();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            signal: signal
        });

        hideStatus();
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        fullResponse = await handleAIResponse(response, isStreaming, aiTextEl, signal, messagesArea);
        messagesArea.scrollTop = messagesArea.scrollHeight;

        hideStatus();

        const endTime = Date.now();
        const responseTime = ((endTime - startTime) / 1000).toFixed(1);
        const tokenEstimate = Math.round(fullResponse.length / 4);
        const speed = responseTime > 0 ? (tokenEstimate / parseFloat(responseTime)).toFixed(1) : '0';

        updateInfoBar(aiMessage, {
            modelName: state.currentModel || 'Local Model',
            modelSize: '',
            modelQuant: '',
            tokens: tokenEstimate,
            time: responseTime,
            speed: speed
        });

        aiTimeEl.textContent = new Date().toLocaleTimeString();
        aiMessage.dataset.content = fullResponse;
        state.messages.push({ role: 'assistant', content: fullResponse });
        await saveChatToBackend(state.uploadedFileId);

    } catch (error) {
        hideStatus();
        if (error.name === 'AbortError') {
            if (fullResponse) {
                aiTextEl.innerHTML = renderMarkdown(fullResponse) + '<br><small style="opacity:0.6"><i class="fas fa-stop"></i> Generation stopped</small>';
                aiTimeEl.textContent = new Date().toLocaleTimeString();
                state.messages.push({ role: 'assistant', content: fullResponse });
                if (!state.isTempChat) await saveChatToBackend(null);
            } else { aiMessage.remove(); }
        } else {
            let userMsg = error.message;
            if (error.message.includes('Failed to fetch')) userMsg = 'Cannot connect to backend. Make sure backend.py is running.';
            aiMessage.className = 'error-message';
            aiMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> <strong>Connection Error</strong><br>${escapeHtml(userMsg)}`;
        }
    }
    state.isTyping = false;
    updateSendButtonState();
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ===============
// =============================================
// [Elemen UI: chat area] Fungsi untuk menghasilkan ulang respons AI
// ============================================================
async function regenerateMessage(btn) {
    if (state.isTyping) return;
    const aiMsgDiv = btn.closest('.message.assistant');
    if (!aiMsgDiv) return;
    const messagesArea = document.getElementById('messagesArea');
    aiMsgDiv.remove();
    const lastAssistantIndex = state.messages.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex !== -1) state.messages = state.messages.slice(0, lastAssistantIndex);
    await resendToAI();
}


// ============================================================
// Logika inti untuk mengirim ulang pesan ke AI (regenerate)
// ============================================================
async function resendToAI() {
    const messagesArea = document.getElementById('messagesArea');
    state.isTyping = true;
    updateSendButtonState();
    showStatus('Regenerating...', 'connecting');
    
    const aiMessage = createMessageFromTemplate('aiMessageTemplate', {
        time: '',
        actions: {
            onRegenerate: function() { regenerateMessage(this); },
            onCopy: function() { copyMessage(this); },
            onDelete: function() { deleteMessage(this); }
        }
    });
    messagesArea.appendChild(aiMessage);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    const aiTextEl = aiMessage.querySelector('.message-content');
    const aiTimeEl = aiMessage.querySelector('.message-time');
    // ... lanjut fetch (TIDAK BERUBAH)

    generationAbortController = new AbortController();
    const signal = generationAbortController.signal;
    let fullResponse = '';
    const startTime = Date.now();

    try {
        const { endpoint, body, isStreaming } = getRequestConfig();
        
        const response = await fetch(endpoint, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: body,
            signal: signal
        });
        
        hideStatus();
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        fullResponse = await handleAIResponse(response, isStreaming, aiTextEl, signal, messagesArea);
        messagesArea.scrollTop = messagesArea.scrollHeight;

        hideStatus();

        const endTime = Date.now();
        const responseTime = ((endTime - startTime) / 1000).toFixed(1);
        const tokenEstimate = Math.round(fullResponse.length / 4);
        const speed = responseTime > 0 ? (tokenEstimate / parseFloat(responseTime)).toFixed(1) : '0';

        updateInfoBar(aiMessage, {
            modelName: state.currentModel || 'Local Model',
            modelSize: '',
            modelQuant: '',
            tokens: tokenEstimate,
            time: responseTime,
            speed: speed
        });

        aiTimeEl.textContent = new Date().toLocaleTimeString();
        aiMessage.dataset.content = fullResponse;
        state.messages.push({ role: 'assistant', content: fullResponse });
        await saveChatToBackend(null);
    } catch (error) {
        hideStatus();
        aiMessage.className = 'error-message';
        aiMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> <strong>Regenerate Failed</strong><br>${escapeHtml(error.message)}`;
    }
    state.isTyping = false;
    updateSendButtonState();
    messagesArea.scrollTop = messagesArea.scrollHeight;
}


// ============================================================
// [Elemen UI: chat area] Fungsi untuk mengedit pesan user
// ============================================================
function editMessage(btn) {
    if (state.isTyping) return;
    const msgDiv = btn.closest('.message');
    if (!msgDiv) return;
    const content = msgDiv.dataset.content;
    const messagesArea = document.getElementById('messagesArea');
    
    // Ambil semua elemen pesan (hanya user/assistant, bukan error)
    const allMessages = Array.from(messagesArea.querySelectorAll('.message'));
    const msgIndex = allMessages.indexOf(msgDiv);
    if (msgIndex === -1) return;
    
    // Potong state.messages sampai indeks tersebut (sebelum pesan yang diedit)
    state.messages = state.messages.slice(0, msgIndex);
    
    // Hapus semua elemen pesan dari indeks tersebut ke akhir
    for (let i = allMessages.length - 1; i >= msgIndex; i--) {
        allMessages[i].remove();
    }

    // Isi input dengan konten yang akan diedit
    document.getElementById('chatInput').value = content;
    document.getElementById('chatInput').focus();
    autoResize(document.getElementById('chatInput'));
}


// ============================================================
// [Elemen UI: chat area] Fungsi untuk menyalin teks pesan
// ============================================================
async function copyMessage(btn) {
    const msgDiv = btn.closest('.message');
    if (!msgDiv) return;
    const content = msgDiv.dataset.content || '';
    try {
        await navigator.clipboard.writeText(content);
        showCopyFeedback(btn);
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = content; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); showCopyFeedback(btn);
    }
}


function showCopyFeedback(btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.innerHTML = original; btn.style.color = ''; }, 1500);
}


