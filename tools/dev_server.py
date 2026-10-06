"""Single-origin dev server: static files plus a POST /dump capture sink.

Why one server? The preview browser routes cross-origin POSTs through a proxy
that answers with its own JSON, so a separate capture sink on another port is
unreachable from the page. Serving the site and the sink from the same origin
makes the capture a plain same-origin fetch.

Usage:  python tools/dev_server.py [port]
"""

import base64
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "dumps"


class Handler(SimpleHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        name = self.path.lstrip("/").split("?")[0]
        if name.startswith("dump/"):
            name = name[len("dump/") :]
        name = name.strip("/") or "frame"
        if not name.replace("-", "").replace("_", "").replace(".", "").isalnum():
            self.send_response(400)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if "," in body:
            body = body.split(",", 1)[1]
        OUT.mkdir(parents=True, exist_ok=True)
        target = OUT / f"{name}.png"
        try:
            target.write_bytes(base64.b64decode(body))
        except Exception as exc:  # noqa: BLE001 - report, never die silently
            self.send_response(500)
            self._cors()
            self.end_headers()
            self.wfile.write(str(exc).encode())
            return
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(str(target.name).encode())

    def end_headers(self):
        # No caching, so a reload always picks up edits.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):  # keep the transcript quiet
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8125
    handler = partial(Handler, directory=str(ROOT))
    print(f"dev server on http://127.0.0.1:{port}/  ->  {ROOT}")
    print(f"captures POST to /dump/<name>  ->  {OUT}")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()