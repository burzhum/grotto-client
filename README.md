# Grotto Client

A lightweight, cross-platform MUD client (gMUD-style): telnet, ANSI color,
aliases, triggers, hotkeys, and saved connection profiles.

## Download
Grab the installer for your OS from the [latest release](../../releases/latest):
- Windows: `Grotto-Client-Setup.exe` (installer) or the portable `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` or `.deb`

The binaries are unsigned, so Windows SmartScreen / macOS Gatekeeper will warn on
first run — choose "Run anyway" / right-click → Open.

## Use
1. Pick a profile (GrottoMud is preset) or add your own MUD in **Settings → Profiles**
   (name, host, port; optional username/password + auto-login).
2. **Connect**.
3. **Settings** to add aliases (`k` → `kill $1`), triggers (pattern → action), and
   hotkeys (Numpad8 → north).

Your settings live in your OS user-data folder; passwords are encrypted locally.
Don't share your `config.json` — each person enters their own credentials.

## Develop
```
npm install
npm test        # unit tests for the engines + telnet parser
npm start       # run the app
npm run dist    # build an installer for your OS
```
