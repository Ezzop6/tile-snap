#!/usr/bin/env bash
# Build the Windows portable .exe from Linux using the official electron-builder
# wine Docker image — no system-wide wine install needed. Output → release/win/.
#
# First run pulls electronuserland/builder:wine (~2-3 GB) + the Windows Electron
# binary (~100 MB); both are cached for subsequent runs.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="electronuserland/builder:wine"
LOG="$(mktemp)"

# Keep the embedded tool version (src/config.js) in sync with package.json, same
# as `make app-*` does on the host (the direct electron-builder call below would
# otherwise skip it).
make version-sync || echo "WARN: version-sync skipped (continuing)"

# Pre-create cache dirs as the current user so the -v mounts aren't root-created.
mkdir -p "$HOME/.cache/electron" "$HOME/.cache/electron-builder"

echo ">> Building Windows portable via $IMAGE ..."
set +e
docker run --rm \
  -v "$PWD":/project \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  "$IMAGE" \
  bash -c "npx electron-builder --win -c.directories.output=release/win" 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
set -e

# electron-builder runs as root inside the container → hand the output back.
[ -d release/win ] && sudo chown -R "$(id -u):$(id -g)" release/win 2>/dev/null || true

echo
if [ "$status" -ne 0 ]; then
  echo "FAIL: electron-builder exited with $status. See log above."
  rm -f "$LOG"
  exit "$status"
fi

echo ">> Done. Output in release/win:"
ls -la release/win 2>/dev/null || echo "   (release/win was not created!)"

# The one warning worth catching: PNG->.ico conversion (rcedit via wine) failing
# silently leaves the generic Electron icon on the .exe.
if grep -qi "default Electron icon is used" "$LOG"; then
  echo
  echo "WARN: log reports 'default Electron icon is used' — PNG->.ico conversion"
  echo "      failed; a native .ico will need to be supplied."
else
  echo "OK: icon converted (no 'default Electron icon' warning)."
fi

rm -f "$LOG"
