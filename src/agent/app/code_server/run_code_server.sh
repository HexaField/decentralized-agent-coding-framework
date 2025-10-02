#!/usr/bin/env bash
set -euo pipefail
mkdir -p /workspace
PASS=${CODE_SERVER_PASSWORD:-password}
export PASSWORD="$PASS"
AUTH_HDR=${CODE_SERVER_AUTH_HEADER:-"X-Agent-Auth"}
AUTH_TOKEN=${CODE_SERVER_TOKEN:-"password"}
if command -v code-server >/dev/null 2>&1; then
	exec code-server --bind-addr 0.0.0.0:8443 --auth password --disable-telemetry /workspace
else
	echo "code-server not found; starting python http.server fallback on :8443 (header auth)"
	cat > /tmp/http.py <<PY
import http.server, socketserver, os
PORT=8443
AUTH_H=os.environ.get('AUTH_HDR','X-Agent-Auth')
AUTH_T=os.environ.get('AUTH_TOKEN','password')
class H(http.server.SimpleHTTPRequestHandler):
	def do_GET(self):
		if self.path=='/health':
			self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(b'{"status":"ok"}')
			return
		if self.headers.get(AUTH_H)!=AUTH_T:
			self.send_response(401); self.end_headers(); return
		return super().do_GET()
os.chdir('/workspace')
with socketserver.TCPServer(('0.0.0.0',PORT), H) as httpd:
	httpd.serve_forever()
PY
	AUTH_HDR="$AUTH_HDR" AUTH_TOKEN="$AUTH_TOKEN" exec python3 /tmp/http.py
fi
