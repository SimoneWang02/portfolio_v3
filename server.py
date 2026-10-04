"""Tiny server: serves the built React app (./dist) and proxies /api/chat to DeepSeek (streaming).

Run:  npm run build && python3 server.py   then open http://localhost:8000
Dev:  python3 server.py  +  npm run dev  (Vite proxies /api here)
The API key is read from .env (DEEPSEEK_API_KEY) and never sent to the browser.
"""
import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
PUBLIC = ROOT / "dist"
PORT = int(os.environ.get("PORT", 8000))
MAX_HISTORY = 12
MAX_CHARS = 1000


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        # SPA fallback: client-side routes like /about get index.html
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if not (PUBLIC / path.lstrip("/")).exists() and "." not in path.rsplit("/", 1)[-1]:
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/chat":
            return self.send_error(404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(min(length, 100_000)))
            history = [
                {"role": m["role"], "content": str(m["content"])[:MAX_CHARS]}
                for m in body.get("messages", [])[-MAX_HISTORY:]
                if m.get("role") in ("user", "assistant")
            ]
        except Exception:
            return self.send_error(400, "Bad request")
        if not API_KEY:
            return self.send_error(500, "DEEPSEEK_API_KEY not set")

        persona = (ROOT / "persona.md").read_text()  # re-read so edits apply live
        payload = {
            "model": MODEL,
            "stream": True,
            "temperature": 0.8,
            "max_tokens": 400,
            "messages": [{"role": "system", "content": persona}] + history,
        }
        req = urllib.request.Request(
            "https://api.deepseek.com/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
        )

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                for raw in resp:
                    line = raw.decode("utf-8", "ignore").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                    if delta:
                        self.wfile.write(delta.encode())
                        self.wfile.flush()
        except urllib.error.HTTPError as e:
            self.wfile.write(f"[error] DeepSeek returned {e.code}: {e.read().decode()[:200]}".encode())
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            self.wfile.write(f"[error] {e}".encode())


if __name__ == "__main__":
    print(f"Chibi running at http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
