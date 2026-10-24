#!/usr/bin/env bash
# Install a per-user launchd agent that starts the studio at login.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UID_NUM="$(id -u)"
LABEL="com.danielvizcayno.musicstudio"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYTHON="$ROOT_DIR/.venv/bin/uvicorn"
BACKEND="$ROOT_DIR/backend"
LOG_DIR="$ROOT_DIR/logs"

if [[ ! -x "$PYTHON" ]]; then
  echo "Missing $PYTHON. Complete the app install first." >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/frontend/dist/index.html" ]]; then
  echo "Missing frontend build. Run: cd frontend && npm run build" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>app.main:app</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>8000</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$BACKEND</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PYTHONPATH</key>
    <string>$BACKEND</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
    <key>HF_HOME</key>
    <string>$ROOT_DIR/../models/hf-cache</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>LANG</key>
    <string>en_US.UTF-8</string>
    <key>PATH</key>
    <string>$ROOT_DIR/../tools/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <!-- Restart on crashes, but leave it stopped after a clean ./stop.sh. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Interactive</string>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null

# Remove any previous instance, then load the new definition.
launchctl bootout "gui/$UID_NUM" "$PLIST" >/dev/null 2>&1 || true
launchctl enable "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || true
if ! launchctl bootstrap "gui/$UID_NUM" "$PLIST" >/dev/null 2>&1; then
  # A non-GUI shell can refuse bootstrap; the plist still auto-loads at login.
  launchctl load -w "$PLIST" >/dev/null 2>&1 || true
fi
launchctl kickstart -k "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || true

for _ in $(seq 1 40); do
  if curl -s -m 2 http://127.0.0.1:8000/api/health | grep -q '"status":"ok"'; then
    echo "Auto-start installed."
    echo "Label: $LABEL"
    echo "Studio: http://127.0.0.1:8000"
    echo "Logs: $LOG_DIR/launchd.out.log / launchd.err.log"
    echo "Disable: ./scripts/uninstall-autostart.sh"
    exit 0
  fi
  sleep 0.5
done

echo "Agent installed, but it could not be started from this shell."
echo "It will load automatically at the next login. To use it now:"
echo "  ./start.sh"
echo "Check: $LOG_DIR/launchd.err.log"
exit 0
