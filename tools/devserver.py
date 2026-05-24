#!/usr/bin/env python3
# Tiny no-cache dev server for the ES-module projects in this repo.
#
# Python's built-in `http.server` sends `Last-Modified` based on file
# mtime, and Chrome aggressively caches ES modules via the resulting
# 304 path. Combined with module-graph dedup, edited files often
# don't show up in the page until a full hard-reload or restart.
#
# This wrapper subclasses SimpleHTTPRequestHandler to emit
# `Cache-Control: no-store, no-cache, must-revalidate` on every
# response and strip `Last-Modified` so the browser always re-fetches
# fresh content. Generic — pass the project root as the third arg:
#   python tools/devserver.py 127.0.0.1 8081 asteroids_clone
#
# Wired up via .claude/launch.json (per-PC, gitignored) so the
# preview_start tool picks it up.

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma",        "no-cache")
        self.send_header("Expires",       "0")
        super().end_headers()

    # SimpleHTTPRequestHandler emits Last-Modified inside send_head()
    # via self.send_header("Last-Modified", ...). Easiest override:
    # intercept send_header() and drop that one header.
    def send_header(self, keyword, value):
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)


def main():
    # Args: bind port directory  (matches launch.json's runtimeArgs)
    bind     = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port     = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    root_dir = sys.argv[3] if len(sys.argv) > 3 else "."

    handler = partial(NoCacheHandler, directory=root_dir)
    httpd = ThreadingHTTPServer((bind, port), handler)
    print(f"no-cache dev server on http://{bind}:{port}/  serving {root_dir}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
