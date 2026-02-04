#!/bin/sh
# This shell script is a convenience wrapper to execute the automation
# script from the repository root. It ensures that Node.js is
# available and then runs main.js using the Node runtime.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js is not installed or not in PATH. Please install Node.js to run this project." >&2
  exit 1
fi

node "$SCRIPT_DIR/main.js"