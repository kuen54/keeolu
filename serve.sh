#!/bin/bash
# Serve the cloned site locally. Any static file server works; this uses Python.
# The site is plain HTML/CSS/JS (no build step, no ES modules), so it also works
# from file:// — but videos and the running server give the most faithful result.
cd "$(dirname "$0")/site" || exit 1
PORT="${1:-8848}"
echo "Serving Keeo Lu clone at http://127.0.0.1:$PORT/"
echo "(Ctrl-C to stop)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
