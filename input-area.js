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

