#!/usr/bin/env bash
# Copy the built web UI into the package so non-editable installs ship it.
#
# `pip install .` / `pipx install .` build a wheel from the package directory;
# only `mitmboard/web_dist/**` is declared as package data (pyproject.toml), and
# that directory does not exist in a checkout. Without this step the installed
# app has no interface at all. Run it after `npm run build` in web/.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/web/dist"
dest="$root/mitmboard/web_dist"

if [ ! -f "$src/index.html" ]; then
  echo "error: $src/index.html not found — run 'npm run build' in web/ first" >&2
  exit 1
fi

rm -rf "$dest"
mkdir -p "$dest"
cp -R "$src/." "$dest/"
echo "staged $(find "$dest" -type f | wc -l | tr -d ' ') files into mitmboard/web_dist"
