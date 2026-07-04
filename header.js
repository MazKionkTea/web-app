// ============================================================
// SIDEBAR & THEME FUNCTIONS
// Fungsi refleks untuk mengatur tampilan antarmuka (UI).
// ============================================================

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
