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

function updateHighlightTheme() {
    const themeLink = document.getElementById('hljs-theme');
    if (!themeLink) return; // aman jika elemen tidak ada

    if (state.isDarkMode) {
        themeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
    } else {
        themeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
    }
}

// [Elemen UI: welcome screen] Mengirim teks saran (quick prompt)
function sendSuggestion(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
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
