# Grotto Client — Design Spec (v1)

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — ready for implementation planning
**Author:** brainstormed with user (burzhum)

## Summary

A modern, lightweight desktop MUD client in the spirit of **gMUD** (a lightweight
zMUD). Cross-platform (Windows, macOS, Linux), shareable as a downloadable
installer, and **MUD-agnostic** — it connects to any telnet MUD, not just
GrottoMud. GrottoMud (`10.37.196.5:4000`) ships as a default connection preset.

v1 delivers the core terminal plus the three highest-value gMUD features:
**aliases, triggers, hotkeys**, with **saved connection profiles** and
**auto-login**. The signature **automapper** and inline trigger effects are
explicitly deferred to phase 2.

## Goals

- Connect to any telnet MUD; render ANSI color with scrollback.
- Aliases (input shortcuts), triggers (pattern → action), hotkeys (key → command).
- Multiple saved connection profiles with optional auto-login.
- Build to a shareable installer on all three desktop platforms.
- Pure, well-tested logic for the bug-prone engines (alias/trigger/hotkey/line parsing).

## Non-Goals (phase 2+)

Automapper (auto-draw rooms, click-to-walk); inline trigger recolor/gag (needs a
custom renderer); session logging; speedwalk; tabbed/multiple simultaneous
connections; sound/notification triggers; scripting language. Code-signing the
binaries.

## Platform & Stack

- **Electron** desktop app (matches the user's Node/JS stack; raw TCP telnet via
  Node `net`).
- **xterm.js** for the output pane (ANSI color, scrollback, selection, performance).
- **electron-builder** for packaging.
- Test runner: `vitest` (or `node:test`) for the pure logic modules.

## Architecture — two processes

### Main process (Node, trusted)
- `main/main.js` — Electron lifecycle, `BrowserWindow`, IPC wiring, config load/save,
  app menu.
- `main/telnet.js` — raw `net.Socket` client. Connect/disconnect, stream bytes both
  ways, minimal telnet IAC handling (strip IAC sequences so they can't corrupt the
  display; respond WONT/DONT to options we don't support). Emits data + status.
- `main/config.js` — load/save `config.json` in Electron `userData`. Passwords stored
  encrypted via Electron **`safeStorage`** (never plaintext on disk).
- `main/preload.js` — `contextBridge` exposes a minimal, typed IPC API to the
  renderer (`contextIsolation: true`, `nodeIntegration: false`).

### Renderer (UI, sandboxed)
- `renderer/terminal.js` — xterm.js setup, write incoming data, dark theme, fit.
- `renderer/lines.js` — accumulate the byte stream into complete logical lines with
  ANSI stripped, for trigger matching. (Display still gets the raw ANSI.)
- `renderer/aliases.js` — expand an input line before sending.
- `renderer/triggers.js` — evaluate each incoming line against patterns → actions.
- `renderer/hotkeys.js` — map keydown events → commands.
- `renderer/app.js` — wire UI, input box + history, send pipeline.
- `renderer/settings-ui.js` — CRUD for profiles / aliases / triggers / hotkeys.

### IPC contract
- main → renderer: `telnet:data` (string chunk), `telnet:status`
  (`connected` | `disconnected` | `error` + message).
- renderer → main: `telnet:connect` (host, port), `telnet:send` (string),
  `telnet:disconnect`, `config:load`, `config:save` (config object).

## Data flow

1. User picks a profile and connects (or auto-connects last profile on launch).
2. Main opens the socket → `telnet:status connected` → streams `telnet:data`.
3. Renderer, per chunk: (a) write raw to **xterm** for display; (b) feed **lines.js**;
   each completed line runs through the **trigger engine**, whose actions may
   `telnet:send` commands.
4. User input → **alias expansion** → split on `;` into multiple commands → each
   `telnet:send` (with optional local echo to the terminal).
5. Hotkey press → resolved command → same alias/send pipeline.
6. **Auto-login:** on connect, if the profile has credentials + autologin, a built-in
   sequence watches for the name/password prompts and sends them.

## Feature formats (concrete)

- **Profile:** `{ id, name, host, port, username, password(enc), autologin, isPreset }`.
  GrottoMud preset: `{ name:'GrottoMud', host:'10.37.196.5', port:4000 }`.
- **Alias:** `{ id, key:'k', command:'kill $1', enabled }`. `$1..$9` = positional args,
  `$*` = all args; a `command` may contain `;` to chain multiple commands.
- **Trigger:** `{ id, pattern, isRegex, type:'command'|'highlight', action, enabled }`.
  `command` sends `action`; `highlight` shows the matched line in a status/highlight
  style. (`gag` and inline recolor = phase 2.)
- **Hotkey:** `{ id, key:'Numpad8'|'F1'|'Ctrl+1', command, enabled }`.

## UI (v1)

Single dark window:
- Top toolbar: profile selector, Connect/Disconnect, Settings.
- Center: output pane (xterm.js, fills available space).
- Bottom: command input (full width, history via Up/Down) + status bar
  (connection state).
- Settings: tabbed modal — **Profiles | Aliases | Triggers | Hotkeys** — each a simple
  add/edit/delete list backed by `config.json`.

Dark theme, monospace, standard 16-color ANSI.

## Persistence

`config.json` in Electron `userData`:
```
{ profiles: [...], aliases: [...], triggers: [...], hotkeys: [...],
  settings: { theme, fontSize, scrollback }, lastProfileId }
```
Passwords encrypted with `safeStorage`; the rest is plain JSON. Users never share
their `config.json`; each enters their own creds.

## Error handling

- Connection refused / timeout / dropped → status-bar message; never crash. Manual
  reconnect button. (Auto-reconnect = phase 2.)
- Invalid trigger regex → flagged in the settings UI and skipped; the per-line loop
  never throws.
- Telnet IAC sequences stripped/answered minimally so they can't corrupt the display.

## Packaging & distribution (all platforms)

- **electron-builder** targets: Windows (NSIS installer **+** portable exe),
  macOS (`.dmg`), Linux (`AppImage` + `.deb`).
- `npm run dist` builds for the **current** OS.
- **GitHub Actions release workflow** (repo on burzhum, private or public) builds on
  `windows-latest`, `macos-latest`, `ubuntu-latest` in parallel on a version tag and
  attaches all installers to a GitHub Release — this is how macOS builds are produced
  without owning a Mac.
- Binaries are **unsigned**: Windows SmartScreen / macOS Gatekeeper will warn; users
  bypass manually. Code-signing/notarization is out of scope.
- `README.md` for sharers: download → run → add your MUD (host/port) → connect.

## Testing

- **Unit tests** (the focus — these are the bug-prone engines, all pure functions):
  - `aliases` — expansion, args, multi-command split.
  - `triggers` — plain + regex match, action resolution, bad-regex safety.
  - `lines` — stream → complete-line assembly, ANSI stripping, partial-line buffering.
  - `hotkeys` — key event → command resolution.
  - `config` — load/save round-trip, `safeStorage` encode/decode (mocked).
- **telnet.js** — against an in-process mock TCP server (connect, receive, send, drop).
- **UI / live** — manual smoke test against GrottoMud `10.37.196.5:4000`.

## Open decisions deferred to implementation

- Exact xterm.js addons (fit, web-links) — pick during build.
- Settings modal vs side panel — pick during build; both acceptable.
