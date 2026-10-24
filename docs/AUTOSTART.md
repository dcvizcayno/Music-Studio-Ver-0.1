# Start at login with launchd

The studio is a local FastAPI server. A per-user `launchd` agent starts it
automatically after you log in to macOS and keeps it alive after crashes.

## Install

```bash
cd /Users/danielvizcayno/Documents/deepseek-harness/default-workspace/Music_draft2
./scripts/install-autostart.sh
```

This writes:

```text
~/Library/LaunchAgents/com.danielvizcayno.musicstudio.plist
```

and loads it. The studio is then available at **http://127.0.0.1:8000** without
opening a terminal.

If `launchctl` refuses to bootstrap from a sandboxed/non-GUI shell, the plist is
still installed and macOS loads it at the next login. Run `./start.sh` to use the
studio immediately; it falls back to a manual launch when the agent cannot start.

## Verify

```bash
curl -s http://127.0.0.1:8000/api/health
launchctl print gui/$(id -u)/com.danielvizcayno.musicstudio | head -30
```

Logs:

```text
logs/launchd.out.log
logs/launchd.err.log
```

## Stop / restart

```bash
./stop.sh                    # clean stop; launchd will not restart it
./scripts/install-autostart.sh   # load and start again
# or:
launchctl kickstart -k gui/$(id -u)/com.danielvizcayno.musicstudio
```

`KeepAlive` is configured with `SuccessfulExit=false`, so a deliberate clean
stop stays stopped, while a crash restarts the server.

## Uninstall

```bash
./scripts/uninstall-autostart.sh
```

## Notes

- This is a **LaunchAgent**, so it starts after the user logs in (not before
  the login window). With FileVault, a reboot still requires the login password.
- It starts the backend and serves the already-built `frontend/dist`. If the
  frontend is rebuilt, no restart is needed because the files are served from disk.
- It does not open a browser automatically. Open http://127.0.0.1:8000 once, or
  add a separate login item/browser automation if you want that.
- Only one process can own port 8000. If a manual `./start.sh` instance is
  running, stop it before installing the agent.
- The agent uses `logs/` in the repo; make sure that directory remains writable.
