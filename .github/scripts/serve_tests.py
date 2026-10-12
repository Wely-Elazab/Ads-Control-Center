# خادم الاختبارات في التكامل المستمر — نفس Live/tests/serve.ps1 (اللي بيتشغّل على ويندوز):
# مجلد Live على http://127.0.0.1:8765/، و/__repo/supabase/... من جذر المستودع (اختبار «عقد المُشغّل» بيقرا runner.ts)
import http.server
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LIVE = os.path.join(ROOT, 'Live')


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/plain',
                      '.webmanifest': 'application/manifest+json'}

    def translate_path(self, path):
        # translate_path نفسها بتشيل أي «..» — مفيش خروج برّه المجلد
        if path.split('?', 1)[0].startswith('/__repo/supabase/'):
            self.directory = ROOT
            path = path[len('/__repo'):]
        else:
            self.directory = LIVE
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
