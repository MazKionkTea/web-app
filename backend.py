#!/usr/bin/env python3
"""
DarkMind AI Backend - Step 2 (Fixed)
1. Jalankan llama-server (subprocess)
2. Jalankan history server (Python http.server)
"""

import subprocess
import sys
import os
import json
import time
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler

# ============================================================
# KONFIGURASI (HARUS DI ATAS SEMUA FUNGSI)
# ============================================================
MODEL_PATH = "/home/kionk/Documents/py-files/AI/model/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf"  # Pastikan path ini 100% benar!
MMPROJ_PATH = "/home/kionk/Documents/py-files/AI/model/mmproj-Qwen3.5-2B-Uncensored-HauhauCS-Aggressive-f16.gguf"
LLAMA_SERVER_PORT = 8080
BACKEND_PORT = 8000
HISTORY_FILE = "chat_history.json"

STATIC_PORT = 3000
FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))  # Folder tempat backend.py berada

class StaticHandler(SimpleHTTPRequestHandler):
    """Serve static files dengan CORS support."""

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # Suppress logging

def start_static_server():
    """Jalankan static file server di thread terpisah."""
    os.chdir(FRONTEND_DIR)  # Pastikan serve dari folder frontend
    server = HTTPServer(('0.0.0.0', STATIC_PORT), StaticHandler)
    print(f"[SUCCESS] Static server running on http://0.0.0.0:{STATIC_PORT}")

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

# ============================================================
# HISTORY FUNCTIONS
# ============================================================
def load_history():
    """Load history dari file JSON."""
    if not os.path.exists(HISTORY_FILE):
        return {}
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to load history: {e}")
        return {}

def save_history(history):
    """Save history ke file JSON."""
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to save history: {e}")

# ============================================================
# HISTORY REQUEST HANDLER
# ============================================================
class HistoryHandler(BaseHTTPRequestHandler):
    """Handle HTTP request untuk history API."""

    def log_message(self, format, *args):
        """Override: suppress default logging."""
        pass

    def _send_cors_headers(self):
        """Tambah CORS header agar browser bisa akses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, data, status=200):
        """Kirim response JSON."""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        """Handle preflight CORS request."""
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Handle GET request."""
        if self.path == '/history':
            history = load_history()
            self._send_json(history)
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        """Handle POST request."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        if self.path == '/history/save':
            history = load_history()
            chat_id = data.get('id')
            if chat_id:
                history[chat_id] = data
                save_history(history)
                self._send_json({"status": "saved", "id": chat_id})
            else:
                self._send_json({"error": "Missing id"}, 400)

        elif self.path == '/history/delete':
            history = load_history()
            chat_id = data.get('id')
            if chat_id and chat_id in history:
                del history[chat_id]
                save_history(history)
                self._send_json({"status": "deleted", "id": chat_id})
            else:
                self._send_json({"error": "Chat not found"}, 404)

        elif self.path == '/history/rename':
            history = load_history()
            chat_id = data.get('id')
            new_title = data.get('title')
            if chat_id and chat_id in history and new_title:
                history[chat_id]['title'] = new_title
                history[chat_id]['timestamp'] = int(time.time() * 1000)
                save_history(history)
                self._send_json({"status": "renamed", "id": chat_id})
            else:
                self._send_json({"error": "Missing id or title"}, 400)

        else:
            self._send_json({"error": "Not found"}, 404)

# ============================================================
# JALANKAN LLAMA-SERVER
# ============================================================
def start_llama_server():
    """Jalankan llama-server sebagai subprocess."""
    import time # 1. Import time
    cmd = [
        "/home/kionk/llama.cpp/build/bin/llama-server",
        "-m", MODEL_PATH,  # 2. Pastikan path model ini benar
        "--mmproj", MMPROJ_PATH,
        "-rea", "off",
        "--host", "0.0.0.0",
        "--port", str(LLAMA_SERVER_PORT),
    ]

    print(f"[INFO] Starting llama-server...")
    print(f"[INFO] Command: {' '.join(cmd)}")

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        print(f"[INFO] llama-server PID: {process.pid}")
        print(f"[INFO] Waiting for model to load (this may take 10-30 seconds)...")

        # Tunggu lebih lama karena model perlu loading
        max_wait = 60  # detik
        for i in range(max_wait):
            time.sleep(1)
            try:
                import urllib.request
                req = urllib.request.urlopen(f"http://localhost:{LLAMA_SERVER_PORT}/health", timeout=2)
                print(f"[SUCCESS] llama-server is ready! Status: {req.status}")
                return process
            except:
                if i % 5 == 0:
                    print(f"[INFO] Still loading... ({i}s)")
                continue

        print(f"[WARNING] Timeout waiting for llama-server, but process is running")
        return process

    except FileNotFoundError:
        print(f"[ERROR] 'llama-server' command not found.")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Failed to start llama-server: {e}")
        sys.exit(1)

# ============================================================
# JALANKAN HISTORY SERVER
# ============================================================
def start_history_server():
    """Jalankan history server di thread terpisah."""
    server = HTTPServer(('0.0.0.0', BACKEND_PORT), HistoryHandler)
    print(f"[SUCCESS] History server running on port {BACKEND_PORT}")

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    print("=" * 50)
    print("DarkMind AI Backend - All-in-One")
    print("=" * 50)

    # 1. Static file server (port 3000)
    static_server = start_static_server()

    # 2. llama-server (port 8080)
    llama_process = start_llama_server()

    # 3. History API (port 8000)
    history_server = start_history_server()

    print("\n" + "=" * 50)
    print("All servers running:")
    print(f"  Frontend:     http://0.0.0.0:{STATIC_PORT}")
    print(f"  llama-server: http://localhost:{LLAMA_SERVER_PORT}")
    print(f"  history API:  http://localhost:{BACKEND_PORT}")
    print("=" * 50)
    print("[INFO] Press Ctrl+C to stop all.")

    try:
        llama_process.wait()
    except KeyboardInterrupt:
        print("\n[INFO] Stopping all servers...")
        llama_process.terminate()
        history_server.shutdown()
        static_server.shutdown()
        print("[INFO] Done.")
