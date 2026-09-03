"""Local-only static preview that always serves fresh assets. No dependencies."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
SECURITY_HEADERS = json.loads((ROOT / "staticwebapp.config.json").read_text())["globalHeaders"]


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_head(self):
        # Ignore conditional requests left over from the old static preview.
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        relative = Path(self.translate_path(self.path)).resolve()
        try:
            parts = relative.relative_to(ROOT).parts
        except ValueError:
            self.send_error(403)
            return None
        if any(part.startswith(".") for part in parts):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    print("Local QA preview: http://127.0.0.1:4173/ (refresh for latest edits)", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", 4173), PreviewHandler).serve_forever()
    except KeyboardInterrupt:
        pass
