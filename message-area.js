// [Elemen UI: chat area] Fungsi utama untuk mengirim pesan ke AI
async function sendMessage() {
    const input = document.getElementById('chatInput'); // [Elemen UI: input area]
    const text = input.value.trim();
    if (!text && !state.uploadedFile) return;
    if (state.isTyping) return;
    
    document.getElementById('welcomeScreen').classList.add('hidden'); // [Elemen UI: welcome screen]
    const messagesArea = document.getElementById('messagesArea'); // [Elemen UI: chat container] / [chat area]
    messagesArea.classList.remove('hidden');

    let userContent = text;
    if (state.uploadedFile) userContent += `\n\n[Attached file: ${escapeHtml(state.uploadedFile.name)}]`;

    // Membuat elemen DOM untuk pesan user
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.dataset.messageId = 'msg_' + Date.now();
    userMessage.dataset.content = userContent;
    userMessage.dataset.role = 'user';

    let displayContent = renderMarkdown(text);
    if (state.uploadedFile) {
        displayContent += `<br><small style="opacity:0.8"><i class="fas fa-paperclip"></i> ${escapeHtml(state.uploadedFile.name)}</small>`;
    }

    userMessage.innerHTML = `
        <div class="message-content">${displayContent}</div>
        <span class="message-time">${new Date().toLocaleTimeString()}</span>
        <div class="message-actions-row">
            <button class="msg-action-btn" onclick="editMessage(this)" title="Edit"><i class="fas fa-pen"></i></button>
            <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy"><i class="fas fa-copy"></i></button>
        </div>
    `;
    messagesArea.appendChild(userMessage);
    state.messages.push({ role: 'user', content: userContent });

    input.value = '';
    input.style.height = 'auto';
    clearFile();
    messagesArea.scrollTop = messagesArea.scrollHeight;

    if (!state.currentChatId) state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    state.isTyping = true; 
    updateSendButtonState();
    showStatus('Connecting to AI...', 'connecting'); // [Elemen UI: dotifikasi]

    // Membuat elemen DOM untuk pesan AI (kosong, akan diisi via stream)
    const aiMessage = document.createElement('div');
    aiMessage.className = 'message assistant';
    aiMessage.dataset.role = 'assistant';
    aiMessage.dataset.content = '';
    aiMessage.innerHTML = `
        <div class="message-content" id="aiResponseText"></div>
        <span class="message-time" id="aiResponseTime"></span>
        <div class="message-actions-row">
            <button class="msg-action-btn" onclick="regenerateMessage(this)" title="Regenerate"><i class="fas fa-redo"></i></button>
            <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy"><i class="fas fa-copy"></i></button>
        </div>
    `;
    messagesArea.appendChild(aiMessage);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    const aiTextEl = aiMessage.querySelector('#aiResponseText');
    const aiTimeEl = aiMessage.querySelector('#aiResponseTime');

    generationAbortController = new AbortController();
    const signal = generationAbortController.signal;
    let fullResponse = '';

    try {
        // Mengirim request POST ke backend AI dengan mode streaming
        const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'local-model', messages: state.messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
            signal: signal
        });

        hideStatus();
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        if (!response.body) throw new Error('Streaming not supported');

        currentStreamReader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        showStatus('AI is thinking...', 'connecting'); // [Elemen UI: dotifikasi]

        try {
            // Membaca stream data chunk per chunk
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
                            aiTextEl.innerHTML = renderMarkdown(fullResponse); // Update UI secara real-time
                            messagesArea.scrollTop = messagesArea.scrollHeight;
                            if (typeof hljs !== 'undefined') {
                                aiTextEl.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                            }
                        }
                    } catch (e) { if (e.message.includes('error')) throw e; }
                }
                if (signal.aborted) break;
            }
        } finally {
            if (currentStreamReader) { currentStreamReader.releaseLock(); currentStreamReader = null; }
            generationAbortController = null;
        }

        hideStatus();
        aiTimeEl.textContent = new Date().toLocaleTimeString();
        aiMessage.dataset.content = fullResponse;
        state.messages.push({ role: 'assistant', content: fullResponse });
        await saveChatToBackend(); // Simpan ke [Elemen UI: history]

    } catch (error) {
        hideStatus();
        if (error.name === 'AbortError') {
            // Jika user membatalkan secara manual
            if (fullResponse) {
                aiTextEl.innerHTML = renderMarkdown(fullResponse) + '<br><small style="opacity:0.6"><i class="fas fa-stop"></i> Generation stopped</small>';
                aiTimeEl.textContent = new Date().toLocaleTimeString();
                state.messages.push({ role: 'assistant', content: fullResponse });
                if (!state.isTempChat) await saveChatToBackend();
            } else { aiMessage.remove(); }
        } else {
            // Jika terjadi error koneksi
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


// [Elemen UI: chat area] Fungsi untuk menghasilkan ulang respons AI terakhir
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


// Logika inti untuk mengirim ulang pesan ke AI (digunakan oleh regenerate)
async function resendToAI() {
    const messagesArea = document.getElementById('messagesArea');
    state.isTyping = true;
    updateSendButtonState();
    showStatus('Regenerating...', 'connecting');
    
    const aiMessage = document.createElement('div');
    aiMessage.className = 'message assistant';
    aiMessage.dataset.role = 'assistant';
    aiMessage.dataset.content = '';
    aiMessage.innerHTML = `
        <div class="message-content" id="aiResponseText_new"></div>
        <span class="message-time" id="aiResponseTime_new"></span>
        <div class="message-actions-row">
            <button class="msg-action-btn" onclick="regenerateMessage(this)" title="Regenerate"><i class="fas fa-redo"></i></button>
            <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy"><i class="fas fa-copy"></i></button>
        </div>
    `;
    messagesArea.appendChild(aiMessage);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    const aiTextEl = aiMessage.querySelector('#aiResponseText_new');
    const aiTimeEl = aiMessage.querySelector('#aiResponseTime_new');

    generationAbortController = new AbortController();
    const signal = generationAbortController.signal;
    let fullResponse = '';

    try {
        const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'local-model', messages: state.messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
            signal: signal
        });
        hideStatus();
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
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
                            if (typeof hljs !== 'undefined') aiTextEl.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                        }
                    } catch (e) { if (e.message.includes('error')) throw e; }
                }
            }
        } finally {
            if (currentStreamReader) { currentStreamReader.releaseLock(); currentStreamReader = null; }
            generationAbortController = null;
        }
        hideStatus();
        aiTimeEl.textContent = new Date().toLocaleTimeString();
        aiMessage.dataset.content = fullResponse;
        state.messages.push({ role: 'assistant', content: fullResponse });
        await saveChatToBackend();
    } catch (error) {
        hideStatus();
        aiMessage.className = 'error-message';
        aiMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> <strong>Regenerate Failed</strong><br>${escapeHtml(error.message)}`;
    }
    state.isTyping = false;
    updateSendButtonState();
    messagesArea.scrollTop = messagesArea.scrollHeight;
}


// [Elemen UI: chat area] Fungsi untuk mengedit pesan user yang sudah dikirim
function editMessage(btn) {
    if (state.isTyping) return;
    const msgDiv = btn.closest('.message');
    if (!msgDiv) return;
    const content = msgDiv.dataset.content;
    const messagesArea = document.getElementById('messagesArea');
    const allMessages = Array.from(messagesArea.querySelectorAll('.message, .error-message'));
    const msgIndex = allMessages.indexOf(msgDiv);
    if (msgIndex === -1) return;
    
    let stateIndex = 0;
    for (let i = 0; i <= msgIndex; i++) {
        if (allMessages[i].dataset.role === 'user' || allMessages[i].dataset.role === 'assistant') stateIndex++;
    }
    // Hapus pesan dari state dan DOM mulai dari pesan yang diedit ke bawah
    state.messages = state.messages.slice(0, stateIndex - 1);
    for (let i = allMessages.length - 1; i >= msgIndex; i--) allMessages[i].remove();

    // Kembalikan teks ke input area
    document.getElementById('chatInput').value = content;
    document.getElementById('chatInput').focus();
    autoResize(document.getElementById('chatInput'));
}


// [Elemen UI: chat area] Fungsi untuk menyalin teks pesan ke clipboard
async function copyMessage(btn) {
    const msgDiv = btn.closest('.message');
    if (!msgDiv) return;
    const content = msgDiv.dataset.content || '';
    try {
        await navigator.clipboard.writeText(content);
        showCopyFeedback(btn);
    } catch (e) {
        // Fallback untuk browser lama
        const ta = document.createElement('textarea');
        ta.value = content; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); showCopyFeedback(btn);
    }
}


// Memberikan umpan balik visual (ikon centang) setelah pesan berhasil disalin
function showCopyFeedback(btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.innerHTML = original; btn.style.color = ''; }, 1500);
}
