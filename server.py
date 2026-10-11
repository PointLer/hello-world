"""Local preview; serves only the website and project documents, on loopback."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        requested = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        parts = Path(requested).parts
        target = (ROOT / requested).resolve()
        if (any(part.startswith('.') or part == '..' for part in parts)
            or not target.is_relative_to(ROOT)
            or (parts[0] not in {'index.html','app.js','favicon.svg','projects.json','projects','My Papers'})):
            self.send_error(404)
            return
        super().do_GET()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

if __name__ == '__main__':
    print('Research archive: http://127.0.0.1:4173', flush=True)
    ThreadingHTTPServer(('127.0.0.1',4173),Handler).serve_forever()
