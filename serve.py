#!/usr/bin/env python3
"""Static file server with CORS enabled, for serving the Hayase extension
manifest + bundle to a locally running Hayase. Bound to localhost only.

Usage: python3 serve.py [port]   (default port 8787)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        # Private Network Access: allow https/app origins to reach localhost
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    server = ThreadingHTTPServer(('127.0.0.1', port), CORSRequestHandler)
    print(f'Serving with CORS on http://127.0.0.1:{port}/')
    print(f'Import into Hayase: http://127.0.0.1:{port}/local-manifest.json')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
