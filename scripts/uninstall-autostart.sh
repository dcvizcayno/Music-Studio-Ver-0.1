#!/usr/bin/env bash
# Disable and remove the per-user auto-start agent.
set -uo pipefail

LABEL="com.danielvizcayno.musicstudio"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

launchctl bootout "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || \
  launchctl bootout "gui/$UID_NUM" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "Auto-start disabled. Remove/stop any remaining backend with ./stop.sh if needed."
