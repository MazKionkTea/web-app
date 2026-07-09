// Konfigurasi backend
const UPLOAD_SERVER = `http://${window.location.hostname}:8001`;
const UPLOAD_ENDPOINT = `${UPLOAD_SERVER}/upload`;


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
// async function handleFileUpload(input) {
//     if (!input.files || !input.files[0]) return;

//     const file = input.files[0];

//     // Validasi ekstensi di frontend (opsional, backend juga validasi)
//     const allowedExtensions = ['.md', '.txt', '.py'];
//     const fileName = file.name.toLowerCase();
//     const extension = '.' + fileName.split('.').pop();
//     if (!allowedExtensions.includes(extension)) {
//         showStatus('Only .md, .txt, .py files are allowed', 'error');
//         input.value = '';
//         return;
//     }

//     // Update UI dulu (feedback instan)
//     state.uploadedFile = file;
//     document.getElementById('fileName').textContent = file.name;
//     document.getElementById('fileInfo').classList.add('show');

//     // Kirim ke backend
//     showStatus('Uploading file...', 'connecting');

//     try {
//         const formData = new FormData();
//         formData.append('file', file);

//         const response = await fetch(`${UPLOAD_SERVER}/upload-process-embed`, {
//             method: 'POST',
//             body: formData
//         });

//         if (!response.ok) {
//             const errorData = await response.json();
//             throw new Error(errorData.detail || 'Upload failed');
//         }

//         const data = await response.json();

//         state.uploadedFileId = data.upload.file_id;
//         state.uploadedFileOriginalName = data.upload.original_filename; // simpan nama asli

//         hideStatus();
//         console.log('File uploaded:', data.original_filename, '→', data.upload.file_id);

//         // Lanjut chunking + embedding
//         showStatus('Processing file...', 'connecting');

//         if (!embedResponse.ok) {
//             const embedError = await embedResponse.json();
//             throw new Error(embedError.detail || 'Processing failed');
//         }

//         const embedData = await embedResponse.json();
//         hideStatus();
//         console.log('File embedded:', embedData.chunks_processed, 'chunks → ChromaDB');

//     } catch (error) {
//         // Upload gagal - reset state
//         state.uploadedFile = null;
//         state.uploadedFileId = null;
//         document.getElementById('fileInput').value = '';
//         document.getElementById('fileInfo').classList.remove('show');
//         showStatus(error.message, 'error');
//     }
// }


async function handleFileUpload(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];

    // Validasi ekstensi
    const allowedExtensions = ['.md', '.txt', '.py'];
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
        showStatus('Only .md, .txt, .py files are allowed', 'error');
        input.value = '';
        return;
    }

    // Update UI
    state.uploadedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileInfo').classList.add('show');

    showStatus('Uploading and processing file...', 'connecting');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${UPLOAD_SERVER}/upload-process-embed`, {
            method: 'POST',
            body: formData
        });

        // Baca sebagai text terlebih dahulu
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Server response is not valid JSON:', responseText);
            throw new Error('Server returned invalid response format.');
        }

        if (!response.ok) {
            throw new Error(data.detail || `Upload failed (HTTP ${response.status})`);
        }

        // Validasi struktur data
        if (!data.upload || !data.storage || typeof data.storage.stored_count !== 'number') {
            console.error('❌ Unexpected response structure:', data);
            throw new Error('Incomplete response from server.');
        }

        // Simpan file_id dan nama asli
        state.uploadedFileId = data.upload.file_id;
        state.uploadedFileOriginalName = data.upload.original_filename;

        hideStatus();
        console.log(`✅ File uploaded: ${data.upload.original_filename} (ID: ${data.upload.file_id})`);
        console.log(`📦 Chunks stored: ${data.storage.stored_count}`);

        showStatus(`✅ Processed: ${data.storage.stored_count} chunks stored`, 'success');
        setTimeout(hideStatus, 3000);

    } catch (error) {
        console.error('❌ Upload error:', error);
        // Reset semua state terkait file
        state.uploadedFile = null;
        state.uploadedFileId = null;
        state.uploadedFileOriginalName = null;
        document.getElementById('fileInput').value = '';
        document.getElementById('fileInfo').classList.remove('show');
        showStatus(`❌ ${error.message || 'Unknown error'}`, 'error');
        setTimeout(hideStatus, 5000);
    }
}


// Membersihkan file yang sudah diunggah
function clearFile() {
    state.uploadedFile = null;
    state.uploadedFileId = null;
    state.uploadedFileOriginalName = null;
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

