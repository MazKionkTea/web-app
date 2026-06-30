// ============================================================
// STATE MANAGEMENT
// ============================================================
const state = {
    sidebarOpen: true,
    isDarkMode: true,
    isTempChat: false,
    currentModel: 'Local Model',
    uploadedFile: null,
    chats: {},
    currentChatId: null,
    isTyping: false,
    messages: []
};

// Variabel untuk mengontrol streaming dan pembatalan
let currentStreamReader = null;
let generationAbortController = null;

// ============================================================
// SIDEBAR FUNCTIONS
// ============================================================
function toggleSidebar() {
    const container = document.getElementById('appContainer');
    const overlay = document.getElementById('sidebarOverlay');
    const icon = document.getElementById('toggleIcon');
    state.sidebarOpen = !state.sidebarOpen;

    if (state.sidebarOpen) {
        container.classList.remove('sidebar-closed');
        overlay.classList.add('show');
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        container.classList.add('sidebar-closed');
        overlay.classList.remove('show');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
}

// ============================================================
// THEME TOGGLE
// ============================================================
function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('themeIcon');
    state.isDarkMode = !state.isDarkMode;

    if (state.isDarkMode) {
        html.classList.remove('light-mode');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    } else {
        html.classList.add('light-mode');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
    updateHighlightTheme();
}

function updateHighlightTheme() {
    const link = document.getElementById('hljs-theme');
    if (!link) return;
    if (state.isDarkMode) {
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    } else {
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    }
}

// ============================================================
// TEMPORARY CHAT
// ============================================================
function toggleTempChat() {
    const btn = document.getElementById('tempChatBtn');
    state.isTempChat = !state.isTempChat;
    btn.classList.toggle('active', state.isTempChat);
    if (state.isTempChat) {
        startNewChat();
    }
}

// ============================================================
// AI AGENT SKILLS
// ============================================================
function toggleAgentSkills() {
    const skills = document.getElementById('agentSkills');
    const chevron = document.getElementById('agentChevron');
    skills.classList.toggle('show');
    chevron.style.transform = skills.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

function selectSkill(element) {
    document.querySelectorAll('.skill-tag').forEach(tag => tag.classList.remove('selected'));
    element.classList.add('selected');
}

// ============================================================
// PROJECTS
// ============================================================
function toggleProjects() {
    const list = document.getElementById('projectsList');
    const chevron = document.getElementById('projectChevron');
    list.classList.toggle('show');
    chevron.style.transform = list.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ============================================================
// SETTINGS
// ============================================================
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const chevron = document.getElementById('settingsChevron');
    panel.classList.toggle('show');
    chevron.style.transform = panel.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

function toggleSwitch(element) {
    element.classList.toggle('active');
}

// ============================================================
// MODEL SELECTOR
// ============================================================
function toggleModelDropdown() {
    const dropdown = document.getElementById('modelDropdown');
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) {
        setTimeout(() => {
            document.addEventListener('click', closeModelDropdown);
        }, 0);
    }
}

function closeModelDropdown(e) {
    const dropdown = document.getElementById('modelDropdown');
    const btn = document.getElementById('modelSelectBtn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('show');
        document.removeEventListener('click', closeModelDropdown);
    }
}

function selectModel(modelName, element) {
    state.currentModel = modelName;
    document.getElementById('selectedModel').textContent = modelName;
    document.querySelectorAll('.model-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');

    document.getElementById('modelDropdown').classList.remove('show');
}

// ============================================================
// FILE UPLOAD
// ============================================================
function handleFileUpload(input) {
    if (input.files && input.files[0]) {
        state.uploadedFile = input.files[0];
        document.getElementById('fileName').textContent = state.uploadedFile.name;
        document.getElementById('fileInfo').classList.add('show');
    }
}

function clearFile() {
    state.uploadedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').classList.remove('show');
}

// ============================================================
// INPUT HANDLING
// ============================================================
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ============================================================
// UTILITIES
// ============================================================
function showStatus(text, type = 'connecting') {
    const bar = document.getElementById('statusBar');
    const txt = document.getElementById('statusText');
    txt.textContent = text;
    bar.className = 'status-bar show ' + type;
}

function hideStatus() {
    document.getElementById('statusBar').classList.remove('show');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Basic HTML sanitization for markdown output.
 */
function sanitizeHtml(html) {
    const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'div', 'span'];
    const allowedAttrs = ['href', 'src', 'alt', 'title', 'class', 'target'];
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    let node;
    while (node = walker.nextNode()) {
        const tag = node.tagName.toLowerCase();
        if (!allowedTags.includes(tag)) {
            toRemove.push(node);
            continue;
        }

        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            if (!allowedAttrs.includes(name) || name.startsWith('on')) {
                node.removeAttribute(attr.name);
            }
            if (name === 'href' && !attr.value.match(/^(https?|mailto|#)/i)) {
                node.removeAttribute('href');
            }
        });
    }
    toRemove.forEach(node => {
        const parent = node.parentNode;
        if (parent) {
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
        }
    });
    return temp.innerHTML;
}

/**
 * Render markdown text to HTML.
 */
function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked === 'undefined') {
        console.error('Marked.js is not loaded.');
        return escapeHtml(text).replace(/\n/g, '<br>'); // Fallback
    }
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false,
        // Penting: Sanitasi dilakukan setelah highlight, bukan oleh marked langsung
        sanitize: false,
        highlight: function(code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                try {
                    // Highlight dengan bahasa tertentu
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) {
                    // Jika bahasa tidak dikenali, fallback
                    console.warn('Highlight.js: Language not found for:', lang);
                    return escapeHtml(code);
                }
            }
            // Jika hljs tidak ditemukan atau tidak ada bahasa, fallback
            if (typeof hljs !== 'undefined') {
                try {
                    // Highlight otomatis
                    return hljs.highlightAuto(code).value;
                } catch (e) {
                     // Jika highlight otomatis gagal, escape saja
                    return escapeHtml(code);
                }
            }
            // Jika hljs tidak ditemukan, escape saja
            return escapeHtml(code);
        }
    });

    try {
        // Parse markdown menjadi HTML mentah
        const rawHtml = marked.parse(text);
        // Sanitasi HTML hasil parsing
        return sanitizeHtml(rawHtml);
    } catch (e) {
        console.error('Markdown parse error:', e);
        // Fallback ke teks biasa jika parsing gagal
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
}

function sendSuggestion(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
}

function updateSendButtonState() {
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (state.isTyping) {
        sendBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
    } else {
        sendBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
    }
}

// ============================================================
// STOP GENERATION FUNCTION
// ============================================================

function stopGeneration() {
    console.log("Stop button pressed.");
    if (generationAbortController) {
        generationAbortController.abort(); // Memicu signal.aborted = true
        console.log("Abort signal sent.");
    }
    // Juga reset reader jika perlu, meskipun finally block seharusnya menanganinya
    if (currentStreamReader) {
        currentStreamReader.cancel(); // Alternatif/cadangan
        currentStreamReader = null;
        generationAbortController = null;
    }
    // Reset UI
    state.isTyping = false;
    updateSendButtonState();
    hideStatus();
    // Beri feedback opsional ke pengguna bahwa respon dihentikan
    // Misalnya, tambahkan pesan ke UI: "Respon dihentikan."
}

// ============================================================
// IP DISPLAY
// ============================================================
function updateIPDisplay() {
    const ipEl = document.getElementById('ipAddressDisplay');
    if (!ipEl) return;
    const host = window.location.hostname;
    const port = window.location.port || '3000';

    if (host === 'localhost' || host === '127.0.0.1') {
        ipEl.innerHTML = ` <i class="fas fa-desktop"> </i> <span>localhost:${port}</span>`;
        ipEl.title = 'Open http://localhost:' + port + ' on other devices in same network';
    } else {
        ipEl.innerHTML = ` <i class="fas fa-network-wired"> </i> <span>${host}:${port}</span>`;
        ipEl.title = 'Share this URL to other devices on same WiFi/LAN';
    }
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
    if (e.key === 'Escape') {
        if (window.innerWidth <= 768 && state.sidebarOpen) {
            toggleSidebar();
        }
        document.getElementById('modelDropdown').classList.remove('show');
    }
});

// ============================================================
// PYTHON BACKEND CONFIGURATION
// ============================================================
// llama-server untuk chat (port 8080)
const LLAMA_SERVER = (() => {
    const host = window.location.hostname;
    return `http://${host}:8080`;
})();
const CHAT_ENDPOINT = `${LLAMA_SERVER}/v1/chat/completions`;

// Python backend untuk history (port 8000)
const HISTORY_BACKEND = (() => {
    const host = window.location.hostname;
    return `http://${host}:8000`;
})();
const HISTORY_ENDPOINT = `${HISTORY_BACKEND}/history`;

// ============================================================
// CHAT FUNCTIONS (Updated for Python Backend)
// ============================================================

/**
 * Fungsi utama: kirim pesan ke Python backend dengan streaming.
 */
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text && !state.uploadedFile) return;
    if (state.isTyping) return;

    // Sembunyikan welcome screen dan tampilkan messages area
    document.getElementById('welcomeScreen').classList.add('hidden');
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.classList.remove('hidden');

    // Build user message content
    let userContent = text;
    if (state.uploadedFile) {
        userContent += `\n\n[Attached file: ${escapeHtml(state.uploadedFile.name)}]`;
    }

    // Tambahkan pesan user ke UI
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.dataset.messageId = 'msg_' + Date.now(); // ← ID unik
    userMessage.dataset.content = userContent; // ← Simpan content asli
    userMessage.dataset.role = 'user';
    let displayContent = renderMarkdown(text).replace(/\n/g, ' <br>');
    if (state.uploadedFile) {
        displayContent += `<br><small style="opacity:0.8"><i class="fas fa-paperclip"></i> ${escapeHtml(state.uploadedFile.name)}</small>`;
    }
    userMessage.innerHTML = `<div class="message-content">${displayContent}</div> <span class="message-time">${new Date().toLocaleTimeString()}</span> <div class="message-actions-row"> <button class="msg-action-btn" onclick="editMessage(this)" title="Edit"> <i class="fas fa-pen"></i> </button> <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy"> <i class="fas fa-copy"></i> </button> </div>`;
    messagesArea.appendChild(userMessage);

    // Simpan ke session history
    state.messages.push({ role: 'user', content: userContent });

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    clearFile();
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Generate chat ID jika belum ada
    if (!state.currentChatId) {
        state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // === STREAMING KE PYTHON BACKEND ===
    state.isTyping = true;
    updateSendButtonState();
    showStatus('Connecting to AI...', 'connecting');

    // Buat container pesan AI
    const aiMessage = document.createElement('div');
    aiMessage.className = 'message assistant';
    aiMessage.dataset.role = 'assistant';
    aiMessage.dataset.content = 'fullResponse';
    aiMessage.innerHTML = `<div class="message-content" id="aiResponseText"></div> <span class="message-time" id="aiResponseTime"></span> <div class="message-actions-row"> <button class="msg-action-btn" onclick="regenerateMessage(this)" title="Regenerate"> <i class="fas fa-redo"></i> </button> <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy"> <i class="fas fa-copy"></i> </button> </div>`;
    // Show actions on hover
    // aiMessage.addEventListener('mouseenter', () => {
    //     aiMessage.querySelector('.message-actions-row').style.opacity = '1';
    // });
    // aiMessage.addEventListener('mouseleave', () => {
    //     aiMessage.querySelector('.message-actions-row').style.opacity = '0';
    // });
    messagesArea.appendChild(aiMessage);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    const aiTextEl = aiMessage.querySelector('#aiResponseText');

    // Inisialisasi controller dan ambil reader
    generationAbortController = new AbortController();
    const signal = generationAbortController.signal;

    try {
        console.log('Sending to:', CHAT_ENDPOINT);
        console.log('Messages:', state.messages);
        const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'local-model',  // llama-server butuh ini
                messages: state.messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4096
            }),
            signal: signal // Tambahkan signal
        });

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        hideStatus();

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error('Streaming not supported by browser');
        }

        // Ambil reader
        currentStreamReader = response.body.getReader(); // Simpan reader ke variabel global
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';

        showStatus('AI is thinking...', 'connecting');

        // Loop streaming
        try {
            while (true) {
                // Periksa apakah pembatalan telah diminta
                if (signal.aborted) {
                    console.log("Stream aborted by user.");
                    break; // Keluar dari loop
                }
                const { done, value } = await currentStreamReader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (signal.aborted) { // Cek lagi di dalam loop untuk reaksi cepat
                        console.log("Stream aborted inside loop.");
                        break; // Keluar dari loop dalam
                    }
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        if (json.error) throw new Error(json.error);
                        const delta = json.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullResponse += delta;
                            aiTextEl.innerHTML = renderMarkdown(fullResponse);
                            messagesArea.scrollTop = messagesArea.scrollHeight;
                            // Panggil highlightAll setelah innerHTML berubah
                            if (typeof hljs !== 'undefined') {
                                hljs.highlightAll();
                            }
                        }
                    } catch (e) {
                        if (e.message.includes('error')) throw e;
                    }
                }
                if (signal.aborted) break; // Break outer loop juga jika diperlukan
            }
        } finally {
            // Pastikan reader dilepas
            if (currentStreamReader) {
                currentStreamReader.releaseLock();
                currentStreamReader = null; // Reset
            }
            generationAbortController = null; // Reset controller
        }


        // Selesai streaming
        hideStatus();
        document.getElementById('aiResponseTime').textContent = new Date().toLocaleTimeString();

        // Simpan response ke session history
        state.messages.push({ role: 'assistant', content: fullResponse });

        // Auto-save ke backend
        await saveChatToBackend();
    } catch (error) {
        hideStatus();
        console.error('AI Error:', error);
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);
        let userMsg = error.message;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            userMsg = 'Cannot connect to Python backend at port 8000. Please make sure backend.py is running.';
        }

        aiMessage.className = 'error-message';
        aiMessage.innerHTML = `
             <i class="fas fa-exclamation-circle"> </i>
             <strong>Connection Error</strong> <br>
            ${escapeHtml(userMsg)} <br> <br>
             <small>Run: <code>python3 backend.py</code> </small>
        `;
    }
    state.isTyping = false;
    updateSendButtonState();
    messagesArea.scrollTop = messagesArea.scrollHeight;
}


/**
 * Regenerate response AI — hapus response ini, kirim ulang history.
 */
async function regenerateMessage(btn) {
    if (state.isTyping) return;
    const aiMsgDiv = btn.closest('.message.assistant');
    if (!aiMsgDiv) return;
    const messagesArea = document.getElementById('messagesArea');
    const allMessages = Array.from(messagesArea.querySelectorAll('.message'));
    const aiIndex = allMessages.indexOf(aiMsgDiv);
    if (aiIndex === -1) return;

    // Hapus AI message dari UI
    aiMsgDiv.remove();

    // Hapus assistant message terakhir dari state
    const lastAssistantIndex = state.messages.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex !== -1) {
        state.messages = state.messages.slice(0, lastAssistantIndex);
    }

    // Kirim ulang ke AI (tanpa tambah user message baru)
    await resendToAI();
}


/**
 * Kirim ulang history ke AI tanpa tambah user message baru.
 */
async function resendToAI() {
    const messagesArea = document.getElementById('messagesArea');
    state.isTyping = true;
    updateSendButtonState();
    showStatus('Regenerating...', 'connecting');

    // Buat container pesan AI baru
    const aiMessage = document.createElement('div');
    aiMessage.className = 'message assistant';
    aiMessage.dataset.role = 'assistant'; // Tambahkan role
    aiMessage.dataset.content = '';
    aiMessage.innerHTML = `<div class="message-content" id="aiResponseText_new"></div> <span class="message-time" id="aiResponseTime_new"></span> <div class="message-actions-row"> <button class="msg-action-btn" onclick="regenerateMessage(this)" title="Regenerate"> <i class="fas fa-redo"></i> </button> <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy"> <i class="fas fa-copy"></i> </button> </div>`;
    messagesArea.appendChild(aiMessage);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    const aiTextEl = aiMessage.querySelector('#aiResponseText_new');
    const aiTimeEl = aiMessage.querySelector('#aiResponseTime_new');

    // Inisialisasi controller dan ambil reader untuk regenerate
    generationAbortController = new AbortController();
    const signal = generationAbortController.signal;

    try {
        const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'local-model', // Tambahkan model
                messages: state.messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4096
            }),
            signal: signal // Tambahkan signal
        });

        hideStatus();

        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        if (!response.body) throw new Error('Streaming not supported');

        // Ambil reader
        currentStreamReader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';

        showStatus('AI is thinking...', 'connecting');

        // Loop streaming untuk regenerate
        try {
            while (true) {
                if (signal.aborted) {
                    console.log("Regenerate stream aborted by user.");
                    break;
                }
                const { done, value } = await currentStreamReader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (signal.aborted) {
                         console.log("Regenerate stream aborted inside loop.");
                         break;
                    }
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        if (json.error) throw new Error(json.error);
                        const delta = json.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullResponse += delta;
                            aiTextEl.innerHTML = renderMarkdown(fullResponse);
                            messagesArea.scrollTop = messagesArea.scrollHeight;
                             // Panggil highlightAll setelah innerHTML berubah
                            if (typeof hljs !== 'undefined') {
                                hljs.highlightAll();
                            }
                        }
                    } catch (e) {
                        if (e.message.includes('error')) throw e;
                    }
                }
                if (signal.aborted) break;
            }
        } finally {
             // Lepaskan reader untuk regenerate
            if (currentStreamReader) {
                currentStreamReader.releaseLock();
                currentStreamReader = null;
            }
            generationAbortController = null;
        }


        hideStatus();
        aiTimeEl.textContent = new Date().toLocaleTimeString();
        aiMessage.dataset.content = fullResponse;

        state.messages.push({ role: 'assistant', content: fullResponse });
        await saveChatToBackend();
    } catch (error) {
        hideStatus();
        console.error('Regenerate Error:', error);
        aiMessage.className = 'error-message';
        aiMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> <strong>Regenerate Failed</strong><br> ${escapeHtml(error.message)}`;
    }
    state.isTyping = false;
    updateSendButtonState();
    messagesArea.scrollTop = messagesArea.scrollHeight;
}


/**
 * Edit pesan user — hapus pesan ini dan semua setelahnya, isi ke input.
 */
function editMessage(btn) {
    const msgDiv = btn.closest('.message');
    if (!msgDiv) return;
    const content = msgDiv.dataset.content;
    const messagesArea = document.getElementById('messagesArea');
    const allMessages = Array.from(messagesArea.querySelectorAll('.message'));
    const msgIndex = allMessages.indexOf(msgDiv);
    if (msgIndex === -1) return;

    // Hapus dari state: pesan ini dan semua setelahnya
    // Hitung berapa message di DOM sebelum index ini
    let stateIndex = 0;
    for (let i = 0; i <= msgIndex; i++) {
        if (allMessages[i].dataset.role === 'user' || allMessages[i].dataset.role === 'assistant') {
            stateIndex++;
        }
    }
    state.messages = state.messages.slice(0, stateIndex - 1);

    // Hapus dari UI: pesan ini dan semua setelahnya
    for (let i = allMessages.length - 1; i >= msgIndex; i--) {
        allMessages[i].remove();
    }

    // Isi ke input
    document.getElementById('chatInput').value = content;
    document.getElementById('chatInput').focus();
    autoResize(document.getElementById('chatInput'));
}


/**
 * Copy pesan ke clipboard.
 */
async function copyMessage(btn) {
    const msgDiv = btn.closest('.message');
    if (!msgDiv) return;
    const content = msgDiv.dataset.content || '';
    try {
        await navigator.clipboard.writeText(content);
        showCopyFeedback(btn);
    } catch (e) {
        // Fallback: buat textarea temporary
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopyFeedback(btn);
    }
}


/**
 * Helper: cari index pesan di DOM.
 */
function getMessageIndex(msgDiv) {
    const messagesArea = document.getElementById('messagesArea');
    const all = messagesArea.querySelectorAll('.message');
    return Array.from(all).indexOf(msgDiv);
}


/**
 * Feedback visual saat copy berhasil.
 */
function showCopyFeedback(btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.color = 'var(--accent)';
    setTimeout(() => {
        btn.innerHTML = original;
        btn.style.color = '';
    }, 1500);
}


// ============================================================
// HISTORY FUNCTIONS (Python Backend)
// ============================================================

/**
 * Simpan chat aktif ke Python backend.
 */
async function saveChatToBackend() {
    if (!state.currentChatId || state.messages.length === 0) return;
    const firstUserMsg = state.messages.find(m => m.role === 'user');
    const title = firstUserMsg
        ? firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '')
        : 'New Chat';

    try {
        await fetch(`${HISTORY_ENDPOINT}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: state.currentChatId,
                title: title,
                messages: state.messages,
                timestamp: Date.now(),
                model: state.currentModel
            })
        });
        renderHistoryList();
    } catch (e) {
        console.warn('Failed to save to backend:', e);
    }
}


/**
 * Muat history dari Python backend.
 */
async function loadHistoryFromBackend() {
    try {
        const response = await fetch(`${HISTORY_ENDPOINT}`);
        const history = await response.json();
        state.chats = history || {};
        renderHistoryList();
    } catch (e) {
        console.warn('Failed to load history from backend:', e);
        state.chats = {};
    }
}


/**
 * Render daftar history di sidebar.
 */
function renderHistoryList() {
    const historyContainer = document.getElementById('historyList');
    if (!historyContainer) return;
    const chats = Object.values(state.chats)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 15);

    if (chats.length === 0) {
        historyContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center;">No history yet</div>';
        return;
    }

    historyContainer.innerHTML = chats.map(chat => `<div class="history-item ${chat.id === state.currentChatId ? 'active' : ''}" onclick="loadChat('${chat.id}')"> <div class="history-content"> <i class="fas fa-comment"></i> <span class="history-title">${escapeHtml(chat.title)}</span> </div> <div class="history-actions"> <button class="history-btn" onclick="renameChat('${chat.id}', event)" title="Rename"> <i class="fas fa-pen"></i> </button> <button class="history-btn delete" onclick="deleteChat('${chat.id}', event)" title="Delete"> <i class="fas fa-trash"></i> </button> </div> </div>`).join('');
}


/**
 * Muat chat dari history.
 */
async function loadChat(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    // Simpan chat aktif sebelumnya
    if (state.messages.length > 0 && state.currentChatId) {
        await saveChatToBackend();
    }

    state.currentChatId = chatId;
    state.messages = chat.messages || [];

    const welcomeScreen = document.getElementById('welcomeScreen');
    const messagesArea = document.getElementById('messagesArea');
    welcomeScreen.classList.add('hidden');
    messagesArea.classList.remove('hidden');
    messagesArea.innerHTML = '';

    // Render semua pesan
    state.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.role}`;
        msgDiv.innerHTML = `<div class="markdown-body">${renderMarkdown(msg.content)}</div> <span class="message-time">${new Date(msg.timestamp || Date.now()).toLocaleTimeString()}</span>`;
        messagesArea.appendChild(msgDiv);
    });

    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Update active state
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    // event.currentTarget.classList.add('active');
    renderHistoryList();
}


/**
 * Hapus chat dari history.
 */
async function deleteChat(chatId, event) {
    event.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    try {
        await fetch(`${HISTORY_ENDPOINT}/delete?chat_id=${chatId}`, { method: 'POST' });
        delete state.chats[chatId];

        if (state.currentChatId === chatId) {
            state.currentChatId = null;
            state.messages = [];
            document.getElementById('welcomeScreen').classList.remove('hidden');
            document.getElementById('messagesArea').classList.add('hidden');
            document.getElementById('messagesArea').innerHTML = '';
        }

        renderHistoryList();
    } catch (e) {
        console.error('Failed to delete chat:', e);
    }
}


/**
 * Rename title chat.
 */
async function renameChat(chatId, event) {
    event.stopPropagation();
    const chat = state.chats[chatId];
    if (!chat) return;

    const newTitle = prompt('Rename conversation:', chat.title);
    if (newTitle && newTitle.trim() !== '' && newTitle !== chat.title) {
        try {
            await fetch(`${HISTORY_ENDPOINT}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: chatId, title: newTitle.trim() })
            });
            chat.title = newTitle.trim();
            renderHistoryList();
        } catch (e) {
            console.error('Failed to rename chat:', e);
        }
    }
}


/**
 * Update startNewChat untuk pakai backend.
 */
function startNewChat() {
    // Simpan chat aktif ke backend
    if (state.messages.length > 0 && state.currentChatId) {
        saveChatToBackend();
    }

    state.currentChatId = null;
    state.isTyping = false;
    state.messages = [];

    const welcomeScreen = document.getElementById('welcomeScreen');
    const messagesArea = document.getElementById('messagesArea');
    const chatInput = document.getElementById('chatInput');

    welcomeScreen.classList.remove('hidden');
    messagesArea.classList.add('hidden');
    messagesArea.innerHTML = '';
    chatInput.value = '';
    chatInput.style.height = 'auto';
    clearFile();
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
}


// // Update DOMContentLoaded
// document.addEventListener('DOMContentLoaded', () => {
//     document.documentElement.classList.remove('light-mode');
//     if (window.innerWidth <= 768) {
//         toggleSidebar();
//     }
//     updateIPDisplay();
//     loadHistoryFromBackend();  // ← GANTI INI
// // Generate chat ID untuk session baru
// if (!state.currentChatId) {
//     state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
// }
// });

document.addEventListener('DOMContentLoaded', () => {
    // Load saved theme preference
    const savedTheme = localStorage.getItem('darkmind-theme');
    if (savedTheme === 'light') {
        state.isDarkMode = false;
        document.documentElement.classList.add('light-mode');
        document.getElementById('themeIcon').classList.remove('fa-moon');
        document.getElementById('themeIcon').classList.add('fa-sun');
    }
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
    updateIPDisplay();
    loadHistoryFromBackend();
    updateSendButtonState();
    updateHighlightTheme();
    // Generate chat ID untuk session baru
    if (!state.currentChatId) {
        state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
});
