// ============================================================
// STATE MANAGEMENT
// Memori jangka pendek aplikasi. Menyimpan status semua elemen UI dan data chat.
// ============================================================
const state = {
    sidebarOpen: true, // [Elemen UI: toggle] Status buka/tutup sidebar
    isDarkMode: true, // [Elemen UI: toggle] Status tema gelap/terang
    isTempChat: false, // [Elemen UI: chat baru] Status mode chat sementara
    currentModel: 'Local Model', // Model AI yang sedang dipilih
    uploadedFile: null, // File yang diunggah user
    chats: {}, // [Elemen UI: history] Penyimpanan data riwayat chat
    currentChatId: null, // ID chat yang sedang aktif
    isTyping: false, // Status apakah AI sedang mengetik/memproses
    messages: [] // [Elemen UI: chat area] Array pesan dalam chat aktif
};
let currentStreamReader = null; // Pembaca stream respons AI
let generationAbortController = null; // Kontrol untuk membatalkan generasi AI

// ============================================================
// SIDEBAR & THEME FUNCTIONS
// Fungsi refleks untuk mengatur tampilan antarmuka (UI).
// ============================================================

// [Elemen UI: aside/sidebar] Fungsi untuk membuka/menutup panel samping
function toggleSidebar() {
    const container = document.getElementById('appContainer'); // [Elemen UI: main konten] Wadah utama
    const overlay = document.getElementById('sidebarOverlay'); // Overlay gelap saat sidebar buka di mobile
    const icon = document.getElementById('toggleIcon'); // Ikon hamburger/times
    state.sidebarOpen = !state.sidebarOpen; // Balik status memori
    
    if (state.sidebarOpen) {
        container.classList.remove('sidebar-closed');
        if(overlay) overlay.classList.add('show');
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        container.classList.add('sidebar-closed');
        if(overlay) overlay.classList.remove('show');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
}

// [Elemen UI: toggle] Fungsi untuk mengganti tema gelap/terang
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
    updateHighlightTheme(); // Update warna highlight kode
    localStorage.setItem('darkmind-theme', state.isDarkMode ? 'dark' : 'light'); // Simpan preferensi
}

// Mengganti tema warna untuk syntax highlighting kode
function updateHighlightTheme() {
    const link = document.getElementById('hljs-theme');
    if (!link) return;
    link.href = state.isDarkMode
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
}

// [Elemen UI: chat baru] Fungsi untuk mengaktifkan mode chat sementara (tidak disimpan)
function toggleTempChat() {
    const btn = document.getElementById('tempChatBtn');
    state.isTempChat = !state.isTempChat;
    btn.classList.toggle('active', state.isTempChat);
    if (state.isTempChat) startNewChat(); // Langsung mulai chat baru jika diaktifkan
}

// [Elemen UI: ai agen] Fungsi untuk membuka/menutup daftar keahlian agen AI
function toggleAgentSkills() {
    const skills = document.getElementById('agentSkills');
    const chevron = document.getElementById('agentChevron');
    skills.classList.toggle('show');
    chevron.style.transform = skills.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

// [Elemen UI: ai agen] Fungsi untuk memilih keahlian agen tertentu
function selectSkill(element) {
    document.querySelectorAll('.skill-tag').forEach(tag => tag.classList.remove('selected'));
    element.classList.add('selected');
}

// [Elemen UI: projek] Fungsi untuk membuka/menutup daftar proyek
function toggleProjects() {
    const list = document.getElementById('projectsList');
    const chevron = document.getElementById('projectChevron');
    list.classList.toggle('show');
    chevron.style.transform = list.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

// [Elemen UI: setting] Fungsi untuk membuka/menutup panel pengaturan
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const chevron = document.getElementById('settingsChevron');
    panel.classList.toggle('show');
    chevron.style.transform = panel.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

// Fungsi generic untuk toggle class 'active' pada elemen switch
function toggleSwitch(element) { element.classList.toggle('active'); }

// [Elemen UI: toggle] Fungsi untuk membuka dropdown pemilihan model AI
function toggleModelDropdown() {
    const dropdown = document.getElementById('modelDropdown');
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) {
        // Tambahkan listener untuk menutup dropdown jika klik di luar
        setTimeout(() => document.addEventListener('click', closeModelDropdown), 0);
    }
}

// Menutup dropdown model jika klik di area luar dropdown
function closeModelDropdown(e) {
    const dropdown = document.getElementById('modelDropdown');
    const btn = document.getElementById('modelSelectBtn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('show');
        document.removeEventListener('click', closeModelDropdown);
    }
}

// Memilih model AI dari dropdown dan memperbarui tampilan
function selectModel(modelName, element) {
    state.currentModel = modelName;
    document.getElementById('selectedModel').textContent = modelName;
    document.querySelectorAll('.model-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('modelDropdown').classList.remove('show');
}

// [Elemen UI: input area] Menangani file yang diunggah user
function handleFileUpload(input) {
    if (input.files && input.files[0]) {
        state.uploadedFile = input.files[0];
        document.getElementById('fileName').textContent = state.uploadedFile.name;
        document.getElementById('fileInfo').classList.add('show');
    }
}

// Membersihkan file yang sudah diunggah
function clearFile() {
    state.uploadedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').classList.remove('show');
}

// [Elemen UI: input area] Menangani tombol Enter untuk mengirim pesan
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// [Elemen UI: input area] Menyesuaikan tinggi textarea secara otomatis saat mengetik
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// [Elemen UI: dotifikasi] Menampilkan bar status (koneksi, thinking, dll)
function showStatus(text, type = 'connecting') {
    const bar = document.getElementById('statusBar');
    const txt = document.getElementById('statusText');
    txt.textContent = text;
    bar.className = 'status-bar show ' + type;
}

// [Elemen UI: dotifikasi] Menyembunyikan bar status
function hideStatus() {
    document.getElementById('statusBar').classList.remove('show');
}

// Mencegah injeksi HTML berbahaya dengan mengubah teks menjadi format aman
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Membersihkan HTML dari tag dan atribut yang tidak diizinkan (XSS prevention)
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
        if (!allowedTags.includes(tag)) { toRemove.push(node); continue; }
        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            if (!allowedAttrs.includes(name) || name.startsWith('on')) node.removeAttribute(attr.name);
            if (name === 'href' && !attr.value.match(/^(https?|mailto|#)/i)) node.removeAttribute('href');
        });
    }
    toRemove.forEach(node => {
        const parent = node.parentNode;
        if (parent) {
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
        }
    });
    return temp.innerHTML;
}

// Mengubah format Markdown menjadi HTML yang aman dan di-highlight
function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
    marked.setOptions({
        breaks: true, gfm: true, headerIds: false, mangle: false, sanitize: false,
        highlight: function(code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                try { return hljs.highlight(code, { language: lang }).value; } catch (e) { return escapeHtml(code); }
            }
            if (typeof hljs !== 'undefined') {
                try { return hljs.highlightAuto(code).value; } catch (e) { return escapeHtml(code); }
            }
            return escapeHtml(code);
        }
    });
    try { return sanitizeHtml(marked.parse(text)); } catch (e) { return escapeHtml(text).replace(/\n/g, '<br>'); }
}

// [Elemen UI: welcome screen] Mengirim teks saran (quick prompt)
function sendSuggestion(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
}

// [Elemen UI: input area] Mengganti tombol Send menjadi Stop saat AI memproses
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

// Membatalkan proses generasi AI yang sedang berjalan
function stopGeneration() {
    if (generationAbortController) generationAbortController.abort();
    if (currentStreamReader) { currentStreamReader.cancel(); currentStreamReader = null; generationAbortController = null; }
    state.isTyping = false;
    updateSendButtonState();
    hideStatus();
}

// [Elemen UI: header] Menampilkan alamat IP server di header
function updateIPDisplay() {
    const ipEl = document.getElementById('ipAddressDisplay');
    if (!ipEl) return;
    const host = window.location.hostname;
    const port = window.location.port || '3000';
    if (host === 'localhost' || host === '127.0.0.1') {
        ipEl.innerHTML = `<i class="fas fa-desktop"></i> <span>localhost:${port}</span>`;
    } else {
        ipEl.innerHTML = `<i class="fas fa-network-wired"></i> <span>${host}:${port}</span>`;
    }
}

// [Elemen UI: search bar] Listener tombol keyboard global (Ctrl+K untuk search, Esc untuk tutup)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput').focus(); }
    if (e.key === 'Escape') {
        if (window.innerWidth <= 768 && state.sidebarOpen) toggleSidebar();
        document.getElementById('modelDropdown').classList.remove('show');
    }
});

// ============================================================
// BACKEND CONFIG & CHAT LOGIC
// Konfigurasi endpoint backend dan logika utama komunikasi AI.
// ============================================================
const LLAMA_SERVER = `http://${window.location.hostname}:8080`;
const CHAT_ENDPOINT = `${LLAMA_SERVER}/v1/chat/completions`;
const HISTORY_BACKEND = `http://${window.location.hostname}:8000`;
const HISTORY_ENDPOINT = `${HISTORY_BACKEND}/history`;

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

// ============================================================
// HISTORY FUNCTIONS
// Logika untuk menyimpan, memuat, dan mengelola riwayat percakapan.
// ============================================================

// [Elemen UI: history] Menyimpan chat saat ini ke backend database
async function saveChatToBackend() {
    if (!state.currentChatId || state.messages.length === 0) return;
    const firstUserMsg = state.messages.find(m => m.role === 'user');
    const title = firstUserMsg ? firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '') : 'New Chat';
    try {
        await fetch(`${HISTORY_ENDPOINT}/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.currentChatId, title: title, messages: state.messages, timestamp: Date.now(), model: state.currentModel })
        });
        renderHistoryList();
    } catch (e) { console.warn('Failed to save to backend:', e); }
}

// [Elemen UI: history] Memuat daftar riwayat chat dari backend
async function loadHistoryFromBackend() {
    try {
        const response = await fetch(`${HISTORY_ENDPOINT}`);
        const history = await response.json();
        state.chats = history || {};
        renderHistoryList();
    } catch (e) { console.warn('Failed to load history:', e); state.chats = {}; }
}

// [Elemen UI: history] Merender daftar riwayat chat ke dalam DOM sidebar
function renderHistoryList() {
    const historyContainer = document.getElementById('historyList');
    if (!historyContainer) return;
    const chats = Object.values(state.chats).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 15);
    if (chats.length === 0) {
        historyContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center;">No history yet</div>';
        return;
    }

    historyContainer.innerHTML = chats.map(chat => `
        <div class="history-item ${chat.id === state.currentChatId ? 'active' : ''}" onclick="loadChat('${chat.id}')">
            <div class="history-content">
                <i class="fas fa-comment"></i>
                <span class="history-title">${escapeHtml(chat.title)}</span>
            </div>
            <div class="history-actions">
                <button class="history-btn" onclick="renameChat('${chat.id}', event)" title="Rename"><i class="fas fa-pen"></i></button>
                <button class="history-btn delete" onclick="deleteChat('${chat.id}', event)" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

// [Elemen UI: history] Memuat isi chat dari riwayat ke layar utama
async function loadChat(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;
    if (state.messages.length > 0 && state.currentChatId) await saveChatToBackend();
    state.currentChatId = chatId;
    state.messages = chat.messages || [];

    document.getElementById('welcomeScreen').classList.add('hidden');
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.classList.remove('hidden');
    messagesArea.innerHTML = '';

    state.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.role}`;
        msgDiv.innerHTML = `
            <div class="markdown-body">${renderMarkdown(msg.content)}</div>
            <span class="message-time">${new Date(msg.timestamp || Date.now()).toLocaleTimeString()}</span>
        `;
        messagesArea.appendChild(msgDiv);
    });
    messagesArea.scrollTop = messagesArea.scrollHeight;
    renderHistoryList();
}

// [Elemen UI: history] Menghapus chat dari backend dan memori
async function deleteChat(chatId, event) {
    event.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
        await fetch(`${HISTORY_ENDPOINT}/delete`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chatId })
        });
        delete state.chats[chatId];
        if (state.currentChatId === chatId) {
            state.currentChatId = null; state.messages = [];
            document.getElementById('welcomeScreen').classList.remove('hidden');
            document.getElementById('messagesArea').classList.add('hidden');
            document.getElementById('messagesArea').innerHTML = '';
        }
        renderHistoryList();
    } catch (e) { console.error('Failed to delete chat:', e); }
}

// [Elemen UI: history] Mengganti judul chat di backend
async function renameChat(chatId, event) {
    event.stopPropagation();
    const chat = state.chats[chatId];
    if (!chat) return;
    const newTitle = prompt('Rename conversation:', chat.title);
    if (newTitle && newTitle.trim() !== '' && newTitle !== chat.title) {
        try {
            await fetch(`${HISTORY_ENDPOINT}/rename`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chatId, title: newTitle.trim() })
            });
            chat.title = newTitle.trim();
            renderHistoryList();
        } catch (e) { console.error('Failed to rename chat:', e); }
    }
}

// [Elemen UI: chat baru] Membersihkan layar dan memulai sesi chat baru
function startNewChat() {
    if (state.messages.length > 0 && state.currentChatId) saveChatToBackend();
    state.currentChatId = null; state.isTyping = false; state.messages = [];
    document.getElementById('welcomeScreen').classList.remove('hidden');
    document.getElementById('messagesArea').classList.add('hidden');
    document.getElementById('messagesArea').innerHTML = '';
    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').style.height = 'auto';
    clearFile();
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
}

// Inisialisasi aplikasi saat DOM selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('darkmind-theme');
    if (savedTheme === 'light') {
        state.isDarkMode = false;
        document.documentElement.classList.add('light-mode');
        document.getElementById('themeIcon').classList.remove('fa-moon');
        document.getElementById('themeIcon').classList.add('fa-sun');
    }
    if (window.innerWidth <= 768) toggleSidebar(); // Tutup sidebar otomatis di layar kecil
    updateIPDisplay(); // [Elemen UI: header]
    loadHistoryFromBackend(); // [Elemen UI: history]
    updateSendButtonState();
    updateHighlightTheme();
    if (!state.currentChatId) state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
});