// ============================================================
// SIDEBAR
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


// [Elemen UI: sidebar] Menampilkan alamat IP server di sidebar
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


// ============================================================
// HISTORY FUNCTIONS
// Logika untuk menyimpan, memuat, dan mengelola riwayat percakapan.
// ============================================================

// [Elemen UI: history] Menyimpan chat saat ini ke backend database
async function saveChatToBackend(fileId = null) {  // ← tambahkan parameter
    if (!state.currentChatId || state.messages.length === 0) return;
    const firstUserMsg = state.messages.find(m => m.role === 'user');
    const title = firstUserMsg ? firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '') : 'New Chat';
    try {
        await fetch(`${HISTORY_ENDPOINT}/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: state.currentChatId,
                title: title,
                messages: state.messages,
                timestamp: Date.now(),
                model: state.currentModel,
                file_id: fileId || state.uploadedFileId || null  // ← gunakan parameter dulu
            })
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
        const templateId = msg.role === 'user' ? 'userMessageTemplate' : 'aiMessageTemplate';
        const msgDiv = createMessageFromTemplate(templateId, {
            content: msg.content,
            html: renderMarkdown(msg.content),
            time: new Date(msg.timestamp || Date.now()).toLocaleTimeString(),
            actions: msg.role === 'user' ? {
                onEdit: function() { editMessage(this); },
                onCopy: function() { copyMessage(this); }
            } : {
                onRegenerate: function() { regenerateMessage(this); },
                onCopy: function() { copyMessage(this); }
            }
        });
        if (msgDiv) messagesArea.appendChild(msgDiv);
    });
    
    if (typeof hljs !== 'undefined') {
        messagesArea.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    } 
    messagesArea.scrollTop = messagesArea.scrollHeight;
    renderHistoryList();
}


// [Elemen UI: history] Menghapus chat dari backend dan memori
async function deleteChat(chatId, event) {
    event.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    
    try {
        // 1. Hapus file dari upload server (jika ada) – tidak mempengaruhi jika gagal
        const chat = state.chats[chatId];
        if (chat && chat.file_id) {
            try {
                const response = await fetch(`http://${window.location.hostname}:8001/files/${chat.file_id}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    console.warn('File delete response not OK:', response.status);
                }
            } catch (fileError) {
                console.warn('Failed to delete file (ignored):', fileError);
                // Lanjutkan ke langkah berikutnya
            }
        }

        // 2. Hapus history dari backend
        await fetch(`${HISTORY_ENDPOINT}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId })
        });

        // 3. Hapus dari state dan perbarui UI
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
        alert('Failed to delete conversation: ' + e.message);
    }
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


// [Elemen UI: setting] Fungsi untuk membuka/menutup panel pengaturan
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const chevron = document.getElementById('settingsChevron');
    panel.classList.toggle('show');
    chevron.style.transform = panel.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}
