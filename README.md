# DarkMind AI - Project Documentation

> **Generated:** 2026-06-20
> **Status:** Active Development
> **Tech Stack:** HTML5, CSS3, Vanilla JavaScript, llama.cpp (llama-server)

---

## 📋 Project Summary

DarkMind AI adalah web-based LLM chat interface dengan tema cybersecurity (Hack The Box style). Aplikasi ini terhubung ke **llama-server** lokal (model GGUF) melalui API OpenAI-compatible dengan fitur **streaming response**.

### Fitur yang Sudah Berjalan
- [x] Sidebar toggle (desktop & mobile)
- [x] Dark/Light theme toggle
- [x] Chat streaming ke llama-server (`localhost:8080`)
- [x] Error handling (server down, network error)
- [x] Session history (per-session array)
- [x] **Persistent history** via `localStorage`
- [x] **Delete & Rename** history chat
- [x] File upload indicator
- [x] Mobile responsive
- [x] IP display untuk akses device lain di LAN
- [x] Auto-save saat unload/refresh

### Catatan untuk Update Selanjutnya
- [ ] Auto-detect model dari `/v1/models` (saat ini hardcode "Local Model")
- [ ] Export/import history (JSON backup)
- [ ] Search history
- [ ] Markdown rendering (code blocks, lists, tables)
- [ ] Syntax highlighting untuk code blocks
- [ ] Multiple model support (switch antara local models)
- [ ] Settings persistence (theme, notifications, etc.)
- [ ] Voice input/output
- [ ] File content extraction (PDF, DOCX, etc.)

---

## 🏗️ Struktur File

```
project-root/
├── index.html          # Entry point, struktur UI
├── style.css           # Styling & tema (dark/light)
├── app.js              # Logika aplikasi & API integration
└── README.md           # Dokumentasi ini
```

---

## 🏛️ Struktur HTML

```html
<!DOCTYPE html>
<html lang="id">
<head>
    <!-- Meta, Title, Font Awesome, style.css, app.js -->
</head>
<body>
    <!-- 1. SIDEBAR OVERLAY (mobile only) -->
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>

    <!-- 2. APP CONTAINER (grid: sidebar + main) -->
    <div class="app-container" id="appContainer">

        <!-- 2a. TOGGLE BUTTON (fixed, outside sidebar) -->
        <button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()">
            <i class="fas fa-bars" id="toggleIcon"></i>
        </button>

        <!-- 2b. SIDEBAR -->
        <aside class="sidebar" id="sidebar">
            <!-- User Profile -->
            <div class="user-profile">
                <div class="user-avatar"><i class="fas fa-user"></i></div>
                <div class="user-name">CyberSec Analyst</div>
                <div class="user-role">Pro Member</div>
                <div class="user-status"><span class="status-dot"></span><span>Online</span></div>
                <div class="ip-display" id="ipAddressDisplay">...</div>  <!-- IP LAN -->
            </div>

            <!-- Navigation -->
            <nav class="sidebar-nav">
                <!-- New Chat Button -->
                <button class="nav-item btn-new-chat" onclick="startNewChat()">...</button>

                <!-- History Section (dynamic) -->
                <div class="nav-section">
                    <div class="nav-section-title">History</div>
                    <div id="historyList">...</div>  <!-- Rendered by JS -->
                </div>

                <!-- AI Agents (expandable) -->
                <div class="nav-section">
                    <div class="nav-section-title">AI Agents</div>
                    <button class="nav-item" onclick="toggleAgentSkills()">...</button>
                    <div class="agent-skills" id="agentSkills">...</div>
                </div>

                <!-- Projects (expandable) -->
                <div class="nav-section">
                    <div class="nav-section-title">Projects</div>
                    <button class="nav-item" onclick="toggleProjects()">...</button>
                    <div class="projects-list" id="projectsList">...</div>
                </div>

                <!-- Settings (expandable) -->
                <div class="nav-section">
                    <div class="nav-section-title">System</div>
                    <button class="nav-item" onclick="toggleSettings()">...</button>
                    <div class="settings-panel" id="settingsPanel">...</div>
                </div>
            </nav>
        </aside>

        <!-- 2c. MAIN CONTENT -->
        <main class="main-content">
            <!-- Header -->
            <header class="main-header">
                <div class="header-left">
                    <div class="app-logo"><i class="fas fa-brain"></i><span>DarkMind AI</span></div>
                </div>
                <div class="header-right">
                    <button class="header-btn" id="tempChatBtn" onclick="toggleTempChat()">...</button>
                    <button class="header-btn" id="themeToggle" onclick="toggleTheme()">...</button>
                </div>
            </header>

            <!-- Search Bar -->
            <div class="search-bar-container">
                <div class="search-bar">
                    <i class="fas fa-search"></i>
                    <input type="text" class="search-input" id="searchInput" placeholder="Search...">
                    <span class="search-shortcut">Ctrl K</span>
                </div>
            </div>

            <!-- Chat Container -->
            <div class="chat-container">
                <!-- Welcome Screen -->
                <div class="welcome-screen" id="welcomeScreen">
                    <div class="welcome-icon"><i class="fas fa-brain"></i></div>
                    <h1 class="welcome-title">How can I assist you today?</h1>
                    <p class="welcome-subtitle">...</p>
                    <div class="welcome-suggestions">
                        <div class="suggestion-card" onclick="sendSuggestion('...')">...</div>
                        <!-- 4 suggestion cards -->
                    </div>
                </div>

                <!-- Messages Area -->
                <div class="messages-area hidden" id="messagesArea">
                    <!-- Messages injected by JS -->
                </div>

                <!-- Input Area -->
                <div class="input-area">
                    <div class="input-wrapper">
                        <div class="input-controls">
                            <div class="input-controls-left">
                                <button class="btn-upload" onclick="document.getElementById('fileInput').click()">...</button>
                                <input type="file" id="fileInput" accept=".txt,.pdf,.doc,.docx,.py,.js,.md" onchange="handleFileUpload(this)">
                                <div class="file-info" id="fileInfo">...</div>
                                <div class="model-selector">
                                    <button class="model-select-btn" id="modelSelectBtn">
                                        <i class="fas fa-microchip"></i>
                                        <span id="selectedModel">Local Model</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <textarea class="chat-input" id="chatInput" placeholder="Message DarkMind AI..."
                            onkeydown="handleKeyDown(event)" oninput="autoResize(this)"></textarea>
                        <div class="input-actions">
                            <button class="btn-send" id="sendBtn" onclick="sendMessage()">...</button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- Status Bar (fixed, overlay) -->
    <div class="status-bar" id="statusBar">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span id="statusText">Connecting...</span>
    </div>
</body>
</html>
```

```markdown
html
├── head
│   ├── meta[charset="UTF-8"]
│   ├── meta[name="viewport"]
│   ├── title
│   │   └── "DarkMind AI - LLM Interface"
│   ├── link[Font Awesome]
│   ├── link[style.css]
│   └── script[app.js]
│
└── body
    ├── div.sidebar-overlay#sidebarOverlay
    │
    ├── div.app-container#appContainer
    │   │
    │   ├── button.sidebar-toggle#sidebarToggle
    │   │   └── i#toggleIcon
    │   │
    │   ├── aside.sidebar#sidebar
    │   │   │
    │   │   ├── div.user-profile
    │   │   │   ├── div.user-avatar
    │   │   │   │   └── i.fa-user
    │   │   │   ├── div.user-name
    │   │   │   ├── div.user-role
    │   │   │   ├── div.user-status
    │   │   │   │   ├── span.status-dot
    │   │   │   │   └── span("Online")
    │   │   │   └── div.ip-display#ipAddressDisplay
    │   │   │       ├── i.fa-spinner
    │   │   │       └── span("Detecting...")
    │   │   │
    │   │   └── nav.sidebar-nav
    │   │       │
    │   │       ├── button.btn-new-chat
    │   │       │   ├── i.fa-plus
    │   │       │   └── span("New Chat")
    │   │       │
    │   │       ├── div.nav-section (History)
    │   │       │   ├── div.nav-section-title
    │   │       │   └── div#historyList
    │   │       │       └── div("Loading...")
    │   │       │
    │   │       ├── div.nav-section (AI Agents)
    │   │       │   ├── div.nav-section-title
    │   │       │   ├── button.nav-item
    │   │       │   │   ├── i.fa-robot
    │   │       │   │   ├── span("AI Agents")
    │   │       │   │   └── i#agentChevron
    │   │       │   │
    │   │       │   └── div.agent-skills#agentSkills
    │   │       │       ├── div.skill-tag.selected
    │   │       │       │   └── "Cyber Security"
    │   │       │       ├── div.skill-tag
    │   │       │       │   └── "Code Review"
    │   │       │       ├── div.skill-tag
    │   │       │       │   └── "Bug Bounty"
    │   │       │       ├── div.skill-tag
    │   │       │       │   └── "OSINT"
    │   │       │       └── div.skill-tag
    │   │       │           └── "Cryptography"
    │   │       │
    │   │       ├── div.nav-section (Projects)
    │   │       │   ├── div.nav-section-title
    │   │       │   ├── button.nav-item
    │   │       │   │   ├── i.fa-folder-open
    │   │       │   │   ├── span("Projects")
    │   │       │   │   └── i#projectChevron
    │   │       │   │
    │   │       │   └── div.projects-list#projectsList
    │   │       │       ├── div.project-item("HTB Academy Labs")
    │   │       │       ├── div.project-item("CTF Writeups")
    │   │       │       ├── div.project-item("Malware Analysis")
    │   │       │       └── div.project-item("Red Team Ops")
    │   │       │
    │   │       └── div.nav-section (Settings)
    │   │           ├── div.nav-section-title
    │   │           ├── button.nav-item
    │   │           │   ├── i.fa-cog
    │   │           │   ├── span("Settings")
    │   │           │   └── i#settingsChevron
    │   │           │
    │   │           └── div.settings-panel#settingsPanel
    │   │               ├── div.setting-item("Notifications")
    │   │               ├── div.setting-item("Auto-save Chat")
    │   │               ├── div.setting-item("Sound Effects")
    │   │               └── div.setting-item("Stream Response")
    │   │
    │   └── main.main-content
    │       │
    │       ├── header.main-header
    │       │   ├── div.header-left
    │       │   │   └── div.app-logo
    │       │   │       ├── i.fa-brain
    │       │   │       ├── span("DarkMind AI")
    │       │   │       └── span.app-tagline
    │       │   │
    │       │   └── div.header-right
    │       │       ├── button#tempChatBtn
    │       │       │   ├── i.fa-fire
    │       │       │   └── span.tooltip
    │       │       └── button#themeToggle
    │       │           ├── i#themeIcon
    │       │           └── span.tooltip
    │       │
    │       ├── div.search-bar-container
    │       │   └── div.search-bar
    │       │       ├── i.fa-search
    │       │       ├── input#searchInput
    │       │       └── span.search-shortcut("Ctrl K")
    │       │
    │       └── div.chat-container
    │           │
    │           ├── div.welcome-screen#welcomeScreen
    │           │   ├── div.welcome-icon
    │           │   ├── h1.welcome-title
    │           │   ├── p.welcome-subtitle
    │           │   └── div.welcome-suggestions
    │           │       ├── div.suggestion-card("OWASP Top 10")
    │           │       ├── div.suggestion-card("Reconnaissance")
    │           │       ├── div.suggestion-card("Python Tools")
    │           │       └── div.suggestion-card("Exploitation")
    │           │
    │           ├── div.messages-area.hidden#messagesArea
    │           │
    │           └── div.input-area
    │               └── div.input-wrapper
    │                   │
    │                   ├── div.input-controls
    │                   │   └── div.input-controls-left
    │                   │       │
    │                   │       ├── button.btn-upload
    │                   │       ├── input[type=file]#fileInput
    │                   │       │
    │                   │       ├── div.file-info#fileInfo
    │                   │       │   ├── i.fa-file
    │                   │       │   ├── span#fileName
    │                   │       │   └── button
    │                   │       │
    │                   │       └── div.model-selector
    │                   │           ├── button#modelSelectBtn
    │                   │           └── div.model-dropdown#modelDropdown
    │                   │               ├── div.model-option("Local Model")
    │                   │               ├── div.model-option("GPT-4 Turbo")
    │                   │               ├── div.model-option("GPT-4o")
    │                   │               ├── div.model-option("Claude 3.5 Sonnet")
    │                   │               ├── div.model-option("Llama 3 70B")
    │                   │               └── div.model-option("Gemini 1.5 Pro")
    │                   │
    │                   ├── textarea#chatInput
    │                   │
    │                   └── div.input-actions
    │                       └── button#sendBtn
    │                           └── i.fa-paper-plane
    │
    └── div.status-bar#statusBar
        ├── i.fa-circle-notch
        └── span#statusText("Connecting...")
```

---

## 🔄 Workflow Aplikasi

### 1. Inisialisasi (DOMContentLoaded)
```
1. Set theme default (dark mode)
2. Tutup sidebar di mobile (if width <= 768px)
3. Tampilkan IP address di sidebar
4. Load history dari localStorage → renderHistoryList()
5. Generate chat ID baru jika belum ada
```

### 2. Kirim Pesan
```
User mengetik → Enter/Click Send
  ↓
1. Validasi input (tidak kosong)
2. Sembunyikan welcomeScreen, tampilkan messagesArea
3. Render pesan user ke UI
4. Simpan ke state.messages[]
5. Tampilkan status bar "Connecting..."
6. Buat placeholder pesan AI (kosong)
  ↓
FETCH POST ke llama-server:8080/v1/chat/completions
  body: { model, messages, stream: true, temperature, max_tokens }
  ↓
7. Parse streaming response (ReadableStream)
8. Update teks AI real-time (huruf per huruf)
9. Simpan response ke state.messages[]
10. Auto-save ke localStorage
11. Update sidebar history list
```

### 3. History Management
```
startNewChat()
  ├── Simpan chat aktif ke localStorage (jika ada pesan)
  ├── Reset state (new ID, empty messages)
  ├── Tampilkan welcome screen
  └── Render history list

loadChat(chatId)
  ├── Simpan chat aktif sebelumnya
  ├── Load messages dari state.chats[chatId]
  ├── Render semua pesan ke UI
  └── Update active state di sidebar

saveCurrentChat()
  ├── Generate title dari pesan pertama user
  ├── Simpan ke state.chats[id]
  ├── Simpan ke localStorage
  └── Render history list

deleteChat(chatId)
  ├── Hapus dari state.chats
  ├── Update localStorage
  ├── Jika chat aktif → reset ke new chat
  └── Render history list

renameChat(chatId)
  ├── Prompt user untuk title baru
  ├── Update title & timestamp
  ├── Update localStorage
  └── Render history list
```

### 4. Sidebar Toggle
```
toggleSidebar()
  ├── Toggle class 'sidebar-closed' di appContainer
  ├── Toggle overlay (mobile)
  ├── Ubah icon (bars ↔ times)
  └── Update state.sidebarOpen
```

### 5. Theme Toggle
```
toggleTheme()
  ├── Toggle class 'light-mode' di <html>
  ├── Ubah icon (moon ↔ sun)
  └── Update state.isDarkMode
```

---

## 🗺️ Roadmap Pengembangan

### Phase 1: Core Chat (✅ DONE)
- [x] Basic chat interface
- [x] llama-server integration
- [x] Streaming response
- [x] Error handling
- [x] Mobile responsive

### Phase 2: History & Persistence (✅ DONE)
- [x] localStorage persistence
- [x] History list di sidebar
- [x] Load/save/delete/rename chat
- [x] Auto-save on unload

### Phase 3: Enhanced UI (NEXT)
- [ ] Markdown rendering (bold, italic, lists, code blocks)
- [ ] Syntax highlighting (highlight.js atau Prism.js)
- [ ] Copy code button
- [ ] Typing indicator saat AI generate
- [ ] Scroll-to-bottom button
- [ ] Timestamp relative ("2 menit yang lalu")

### Phase 4: Model Management (NEXT)
- [ ] Auto-detect models dari `GET /v1/models`
- [ ] Multiple model support (switch model)
- [ ] Model info display (context length, parameter size)
- [ ] Model download/management UI

### Phase 5: Advanced Features (FUTURE)
- [ ] Export/import history (JSON/CSV)
- [ ] Search dalam history
- [ ] File content extraction (PDF, DOCX, TXT)
- [ ] Voice input (Web Speech API)
- [ ] Voice output (TTS)
- [ ] Image generation support (if model supports)
- [ ] System prompt customization
- [ ] Temperature/top_p/top_k controls di UI

### Phase 6: Deployment (FUTURE)
- [ ] Docker containerization
- [ ] HTTPS support (self-signed atau Let's Encrypt)
- [ ] Authentication (basic auth atau OAuth)
- [ ] Multi-user support

---

## 🔌 API Integration

### Endpoint
```javascript
const LLAMA_SERVER = (() => {
    const host = window.location.hostname;
    return `http://${host}:8080`;  // Auto-detect IP untuk LAN access
})();
const LLAMA_ENDPOINT = `${LLAMA_SERVER}/v1/chat/completions`;
```

### Request Format
```json
{
  "model": "local-model",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### Response Format (Streaming)
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: [DONE]
```

### Error Handling
| Error | Pesan User |
|-------|-----------|
| Failed to fetch / NetworkError | "Cannot connect to llama-server at localhost:8080..." |
| 404 | "llama-server endpoint not found..." |
| 500 | "Server internal error. Check llama-server logs." |
| Streaming not supported | "Browser tidak mendukung streaming." |

---

## 🎨 CSS Architecture

### Theme System (CSS Variables)
```css
:root {
  --bg-primary: #141d2b;      /* Dark background */
  --bg-secondary: #1a2332;    /* Sidebar/header */
  --accent: #9fef00;          /* Hack The Box green */
  --text-primary: #a4b1cd;    /* Main text */
  --text-bright: #ffffff;     /* Headings */
}

html.light-mode {
  --bg-primary: #f0f2f5;
  --bg-secondary: #ffffff;
  --accent: #2d6a4f;
  --text-primary: #1a1a2e;
}
```

### Layout (CSS Grid + Flexbox)
```
.app-container (grid)
  ├── .sidebar (fixed width 280px, sticky)
  │     └── .sidebar-toggle (fixed, z-index 201)
  └── .main-content (flex column, 100vh)
        ├── .main-header (fixed height 60px)
        ├── .search-bar-container
        └── .chat-container (flex column, overflow hidden)
              ├── .welcome-screen (flex center, scrollable)
              ├── .messages-area (flex:1, overflow-y:auto)
              └── .input-area (flex-shrink:0)
```

### Mobile Breakpoint (max-width: 768px)
- Sidebar → overlay fixed (translateX)
- Toggle button → fixed left 15px
- Welcome suggestions → single column
- Messages max-width → 90%
- Input padding → reduced

---

## 🧠 State Management

```javascript
const state = {
    sidebarOpen: true,          // Boolean
    isDarkMode: true,           // Boolean
    isTempChat: false,          // Boolean (not implemented yet)
    currentModel: 'Local Model', // String (hardcoded)
    uploadedFile: null,         // File object
    chats: {},                  // Object { chatId: { id, title, messages[], timestamp, model } }
    currentChatId: null,        // String
    isTyping: false,            // Boolean (lock saat AI generate)
    messages: []                // Array { role, content }
};
```

### localStorage Keys
| Key | Value |
|-----|-------|
| `darkmind_chats` | JSON string dari `state.chats` |

---

## 🚀 Cara Menjalankan

### 1. Jalankan llama-server (Backend)
```bash
# Download model GGUF terlebih dahulu
# Jalankan server
llama-server     -m /path/to/model.gguf     --host 0.0.0.0     --port 8080     -c 4096     --n-gpu-layers 35
```

### 2. Jalankan Web Server (Frontend)
```bash
# Di folder project (tempat index.html, app.js, style.css)
cd /path/to/project

# Python 3 (Kali Linux)
python3 -m http.server 3000 --bind 0.0.0.0

# Akses dari PC: http://localhost:3000
# Akses dari HP di LAN: http://192.168.1.10:3000 (lihat IP di sidebar)
```

---

## 🐛 Known Issues & Solutions

| Issue | Solusi |
|-------|--------|
| Toggle sidebar tidak muncul di mobile | Tombol harus **di luar** `<aside class="sidebar">`, pakai `position: fixed` |
| Welcome screen tidak menghilang | Tambah `.welcome-screen.hidden { display: none; }` |
| Input area terpotong di mobile | `.main-content` harus `height: 100vh; overflow: hidden;`, `.input-area` harus `flex-shrink: 0` |
| CORS error | llama-server harus dijalankan dengan `--host 0.0.0.0` |
| localStorage penuh | Implementasi LRU (hapus chat terlama) atau export ke file |

---

## 📝 Catatan Penting untuk Session Berikutnya

1. **File yang diedit terakhir:** `app.js`, `style.css`, `index.html`
2. **Bug yang sudah fixed:** Toggle sidebar, welcome screen hidden, mobile scroll
3. **Fitur yang sudah jalan:** Streaming chat, history persistence, delete/rename
4. **Next priority:** Markdown rendering, auto-detect models, export history
5. **llama-server harus selalu pakai `--host 0.0.0.0`** untuk LAN access
6. **IP auto-detect** sudah ada di `app.js` via `window.location.hostname`

---

*End of Documentation*
