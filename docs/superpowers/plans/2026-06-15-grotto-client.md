# Grotto Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Electron MUD client (gMUD-style) with telnet, ANSI rendering, aliases, triggers, hotkeys, saved profiles, and shareable installers.

**Architecture:** Electron two-process app. Main process owns the raw-TCP telnet socket (`net.Socket`) plus a pure telnet/IAC parser; renderer renders ANSI via xterm.js and runs pure engines for aliases/triggers/hotkeys/line-parsing. Main and renderer talk over a small typed IPC bridge (`contextIsolation` on, `nodeIntegration` off). The bug-prone logic (engines + telnet parser) is pure and unit-tested; Electron glue + UI are verified manually against the live GrottoMud.

**Tech Stack:** Electron, xterm.js (+ `@xterm/addon-fit`), Node `net`, electron-builder, vitest. ESM modules throughout.

---

## File Structure

```
GrottoClient/
  package.json
  electron-builder.yml
  .github/workflows/release.yml
  README.md
  src/
    engines/                 # PURE, unit-tested (no Electron, no DOM)
      lines.js               # stream -> complete ANSI-stripped lines
      aliases.js             # input -> expanded command list
      triggers.js            # compile patterns, match line -> actions
      hotkeys.js             # key event -> command
    main/
      telnet-parser.js       # PURE: IAC/ECHO/chunk parsing (unit-tested)
      telnet.js              # net.Socket wrapper using the parser
      config.js              # load/save config.json, safeStorage password
      main.js                # Electron lifecycle + IPC wiring
      preload.js             # contextBridge IPC API
    renderer/
      index.html             # window markup
      style.css              # dark theme
      terminal.js            # xterm.js setup + write
      app.js                 # wire input/output/echo/history/send
      settings-ui.js         # profiles/aliases/triggers/hotkeys CRUD
  test/
    lines.test.js
    aliases.test.js
    triggers.test.js
    hotkeys.test.js
    telnet-parser.test.js
    telnet.test.js
    config.test.js
```

Spec: `docs/superpowers/specs/2026-06-15-grotto-client-design.md`.

---

## Task 1: Project scaffold + test runner

**Files:**
- Create: `package.json`, `test/smoke.test.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "grotto-client",
  "version": "0.1.0",
  "description": "A lightweight cross-platform MUD client (gMUD-style).",
  "type": "module",
  "main": "src/main/main.js",
  "scripts": {
    "build": "esbuild src/renderer/app.js --bundle --format=esm --outfile=src/renderer/app.bundle.js",
    "start": "npm run build && electron .",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "npm run build && electron-builder"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "esbuild": "^0.23.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0"
  }
}
```

- [ ] **Step 2: Add a smoke test** in `test/smoke.test.js`

```js
import { test, expect } from 'vitest';
test('test runner works', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 3: Install deps**

Run: `npm install`
Expected: installs without error; `node_modules/` present (already gitignored).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json test/smoke.test.js
git commit -m "chore: scaffold electron project + vitest"
```

---

## Task 2: `lines.js` — stream to ANSI-stripped lines

**Files:**
- Create: `src/engines/lines.js`
- Test: `test/lines.test.js`

- [ ] **Step 1: Write failing tests** in `test/lines.test.js`

```js
import { test, expect } from 'vitest';
import { stripAnsi, createLineBuffer } from '../src/engines/lines.js';

test('stripAnsi removes CSI color codes', () => {
  expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
});

test('line buffer emits complete lines only, strips CR and ANSI', () => {
  const b = createLineBuffer();
  expect(b.push('\x1b[32mhello\x1b[0m\r\nwor')).toEqual(['hello']);
  expect(b.push('ld\n')).toEqual(['world']);
});

test('line buffer holds a partial line until its newline arrives', () => {
  const b = createLineBuffer();
  expect(b.push('no newline yet')).toEqual([]);
  expect(b.push(' done\n')).toEqual(['no newline yet done']);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/lines.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/engines/lines.js`

```js
// Strip ANSI CSI sequences (colors, cursor moves) for trigger matching.
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

// Accumulate raw text chunks and yield complete lines (ANSI stripped, CR trimmed).
// A trailing partial line is buffered until its newline arrives.
export function createLineBuffer() {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk;
      const out = [];
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const raw = buf.slice(0, idx).replace(/\r$/, '');
        out.push(stripAnsi(raw));
        buf = buf.slice(idx + 1);
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/lines.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/lines.js test/lines.test.js
git commit -m "feat(engines): line buffer + ANSI strip"
```

---

## Task 3: `aliases.js` — input expansion

**Files:**
- Create: `src/engines/aliases.js`
- Test: `test/aliases.test.js`

- [ ] **Step 1: Write failing tests** in `test/aliases.test.js`

```js
import { test, expect } from 'vitest';
import { splitCommands, expandInput } from '../src/engines/aliases.js';

const aliases = [
  { key: 'k', command: 'kill $1', enabled: true },
  { key: 'gear', command: 'wear sword;wear shield', enabled: true },
  { key: 'sayall', command: 'say $*', enabled: true },
  { key: 'off', command: 'flee', enabled: false },
];

test('splitCommands splits on ; and trims', () => {
  expect(splitCommands('a; b ;c')).toEqual(['a', 'b', 'c']);
});

test('no matching alias returns input unchanged as single command', () => {
  expect(expandInput('north', aliases)).toEqual(['north']);
});

test('positional arg substitution', () => {
  expect(expandInput('k goblin', aliases)).toEqual(['kill goblin']);
});

test('$* captures all args', () => {
  expect(expandInput('sayall hi there', aliases)).toEqual(['say hi there']);
});

test('multi-command alias splits on ;', () => {
  expect(expandInput('gear', aliases)).toEqual(['wear sword', 'wear shield']);
});

test('disabled alias is ignored', () => {
  expect(expandInput('off', aliases)).toEqual(['off']);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/aliases.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/engines/aliases.js`

```js
// Split a command string into individual commands on the separator (default ';').
export function splitCommands(s, sep = ';') {
  return s.split(sep).map((c) => c.trim()).filter((c) => c.length > 0);
}

// Expand an input line against the alias list. Returns the list of commands to send.
// Matches on the FIRST whitespace-delimited word. $1..$9 = positional args, $* = all.
export function expandInput(input, aliases, sep = ';') {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/);
  const word = parts[0];
  const args = parts.slice(1);
  const alias = aliases.find((a) => a.enabled && a.key === word);
  if (!alias) return [trimmed];
  const expanded = alias.command
    .replace(/\$([1-9])/g, (_, n) => args[Number(n) - 1] ?? '')
    .replace(/\$\*/g, args.join(' '));
  return splitCommands(expanded, sep);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/aliases.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/aliases.js test/aliases.test.js
git commit -m "feat(engines): alias expansion"
```

---

## Task 4: `triggers.js` — pattern match to actions

**Files:**
- Create: `src/engines/triggers.js`
- Test: `test/triggers.test.js`

- [ ] **Step 1: Write failing tests** in `test/triggers.test.js`

```js
import { test, expect } from 'vitest';
import { compileTriggers, runTriggers } from '../src/engines/triggers.js';

test('plain substring trigger fires a command action', () => {
  const compiled = compileTriggers([
    { pattern: 'You are hungry', isRegex: false, type: 'command', action: 'eat bread', enabled: true },
  ]);
  expect(runTriggers('You are hungry.', compiled)).toEqual([
    { type: 'command', action: 'eat bread' },
  ]);
  expect(runTriggers('all good', compiled)).toEqual([]);
});

test('regex trigger matches', () => {
  const compiled = compileTriggers([
    { pattern: '^(\\w+) tells you', isRegex: true, type: 'highlight', action: '', enabled: true },
  ]);
  expect(runTriggers('Bob tells you hi', compiled)).toEqual([
    { type: 'highlight', action: '' },
  ]);
});

test('disabled trigger never fires', () => {
  const compiled = compileTriggers([
    { pattern: 'x', isRegex: false, type: 'command', action: 'y', enabled: false },
  ]);
  expect(runTriggers('x', compiled)).toEqual([]);
});

test('invalid regex is flagged, not thrown, and never matches', () => {
  const compiled = compileTriggers([
    { pattern: '(', isRegex: true, type: 'command', action: 'z', enabled: true },
  ]);
  expect(compiled[0].error).toBeTruthy();
  expect(() => runTriggers('anything (', compiled)).not.toThrow();
  expect(runTriggers('anything (', compiled)).toEqual([]);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/triggers.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/engines/triggers.js`

```js
// Pre-compile triggers into matchers. Invalid regex is captured as `.error`
// (the trigger is kept so the UI can flag it) and never matches.
export function compileTriggers(triggers) {
  return triggers.map((t) => {
    if (t.isRegex) {
      try {
        const re = new RegExp(t.pattern);
        return { trigger: t, test: (line) => re.test(line) };
      } catch (e) {
        return { trigger: t, error: e.message, test: () => false };
      }
    }
    return { trigger: t, test: (line) => line.includes(t.pattern) };
  });
}

// Run a single incoming line against compiled triggers; return the fired actions.
export function runTriggers(line, compiled) {
  const actions = [];
  for (const c of compiled) {
    if (c.error || !c.trigger.enabled) continue;
    if (c.test(line)) actions.push({ type: c.trigger.type, action: c.trigger.action });
  }
  return actions;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/triggers.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/triggers.js test/triggers.test.js
git commit -m "feat(engines): trigger compile + match"
```

---

## Task 5: `hotkeys.js` — key event to command

**Files:**
- Create: `src/engines/hotkeys.js`
- Test: `test/hotkeys.test.js`

- [ ] **Step 1: Write failing tests** in `test/hotkeys.test.js`

```js
import { test, expect } from 'vitest';
import { keyEventToString, resolveHotkey } from '../src/engines/hotkeys.js';

test('keyEventToString builds modifier+key string', () => {
  expect(keyEventToString({ ctrlKey: true, key: '1', code: 'Digit1' })).toBe('Ctrl+1');
  expect(keyEventToString({ key: 'F1', code: 'F1' })).toBe('F1');
  expect(keyEventToString({ key: '8', code: 'Numpad8' })).toBe('Numpad8');
});

test('resolveHotkey returns command for an enabled match', () => {
  const hotkeys = [
    { key: 'Numpad8', command: 'north', enabled: true },
    { key: 'F1', command: "cast 'heal'", enabled: false },
  ];
  expect(resolveHotkey('Numpad8', hotkeys)).toBe('north');
  expect(resolveHotkey('F1', hotkeys)).toBeNull();
  expect(resolveHotkey('F2', hotkeys)).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/hotkeys.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/engines/hotkeys.js`

```js
// Normalize a DOM KeyboardEvent into a stable string like "Ctrl+1", "F1", "Numpad8".
export function keyEventToString(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  // Numpad keys are identified by code so they're distinct from the number row.
  const isNumpad = typeof e.code === 'string' && e.code.startsWith('Numpad');
  parts.push(isNumpad ? e.code : e.key);
  return parts.join('+');
}

// Look up the command bound to a key string. Returns null if none / disabled.
export function resolveHotkey(keyStr, hotkeys) {
  const h = hotkeys.find((h) => h.enabled && h.key === keyStr);
  return h ? h.command : null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/hotkeys.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/hotkeys.js test/hotkeys.test.js
git commit -m "feat(engines): hotkey resolution"
```

---

## Task 6: `telnet-parser.js` — IAC/ECHO/chunk parsing (pure)

This is the trickiest pure module: it must strip IAC sequences from the display
text, answer/track the ECHO option, and survive sequences split across TCP chunks.

**Files:**
- Create: `src/main/telnet-parser.js`
- Test: `test/telnet-parser.test.js`

- [ ] **Step 1: Write failing tests** in `test/telnet-parser.test.js`

```js
import { test, expect } from 'vitest';
import { createTelnetParser, IAC, WILL, WONT, DO, DONT, TELOPT_ECHO } from '../src/main/telnet-parser.js';

test('passes plain text through unchanged', () => {
  const p = createTelnetParser();
  const r = p.feed(Buffer.from('hello world'));
  expect(r.text).toBe('hello world');
  expect(r.events).toEqual([]);
  expect(r.reply.length).toBe(0);
});

test('strips an IAC WILL ECHO, emits echo off, replies DO ECHO', () => {
  const p = createTelnetParser();
  const r = p.feed(Buffer.from([0x68, IAC, WILL, TELOPT_ECHO, 0x69])); // 'h', seq, 'i'
  expect(r.text).toBe('hi');
  expect(r.events).toEqual([{ type: 'echo', value: 'off' }]);
  expect([...r.reply]).toEqual([IAC, DO, TELOPT_ECHO]);
});

test('IAC WONT ECHO emits echo on, replies DONT ECHO', () => {
  const p = createTelnetParser();
  const r = p.feed(Buffer.from([IAC, WONT, TELOPT_ECHO]));
  expect(r.text).toBe('');
  expect(r.events).toEqual([{ type: 'echo', value: 'on' }]);
  expect([...r.reply]).toEqual([IAC, DONT, TELOPT_ECHO]);
});

test('escaped IAC IAC becomes a single 0xFF byte in text', () => {
  const p = createTelnetParser();
  const r = p.feed(Buffer.from([0x41, IAC, IAC, 0x42])); // A, 0xFF, B
  expect(r.text).toBe('A\xFFB');
});

test('reassembles an IAC sequence split across two chunks', () => {
  const p = createTelnetParser();
  const r1 = p.feed(Buffer.from([0x78, IAC])); // 'x' then dangling IAC
  expect(r1.text).toBe('x');
  expect(r1.events).toEqual([]);
  const r2 = p.feed(Buffer.from([WILL, TELOPT_ECHO, 0x79])); // rest + 'y'
  expect(r2.text).toBe('y');
  expect(r2.events).toEqual([{ type: 'echo', value: 'off' }]);
  expect([...r2.reply]).toEqual([IAC, DO, TELOPT_ECHO]);
});

test('unknown WILL <opt> is refused with DONT', () => {
  const p = createTelnetParser();
  const r = p.feed(Buffer.from([IAC, WILL, 99]));
  expect([...r.reply]).toEqual([IAC, DONT, 99]);
  expect(r.events).toEqual([]);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/telnet-parser.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/main/telnet-parser.js`

```js
export const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251;
export const SB = 250, SE = 240, TELOPT_ECHO = 1;

// Stateful telnet parser. feed(Buffer) -> { text, events, reply }:
//   text   = displayable string with IAC sequences removed (IAC IAC -> 0xFF)
//   events = [{ type:'echo', value:'on'|'off' }, ...]
//   reply  = Buffer of option negotiation bytes to send back to the server
// Holds a partial IAC sequence across chunk boundaries.
export function createTelnetParser() {
  let pending = []; // bytes of an in-progress IAC sequence

  return {
    feed(buf) {
      let text = '';
      const events = [];
      const reply = [];

      const handleCmd = (seq) => {
        // seq starts with IAC. Returns true if a full command was consumed.
        const cmd = seq[1];
        if (cmd === IAC) { text += '\xFF'; return 2; }      // escaped 0xFF
        if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
          if (seq.length < 3) return 0;                     // need the option byte
          const opt = seq[2];
          if (opt === TELOPT_ECHO) {
            if (cmd === WILL) { reply.push(IAC, DO, TELOPT_ECHO); events.push({ type: 'echo', value: 'off' }); }
            else if (cmd === WONT) { reply.push(IAC, DONT, TELOPT_ECHO); events.push({ type: 'echo', value: 'on' }); }
            // DO/DONT ECHO from server about our echo: ignore (we don't echo to them).
          } else {
            // Refuse anything we don't implement.
            if (cmd === WILL) reply.push(IAC, DONT, opt);
            else if (cmd === DO) reply.push(IAC, WONT, opt);
          }
          return 3;
        }
        if (cmd === SB) {
          // Subnegotiation: consume up to IAC SE; if incomplete, wait for more.
          for (let i = 2; i < seq.length - 1; i++) {
            if (seq[i] === IAC && seq[i + 1] === SE) return i + 2;
          }
          return 0; // incomplete
        }
        // Other 2-byte commands (NOP, GA, etc.) — consume and ignore.
        return 2;
      };

      let data = pending.length ? [...pending, ...buf] : [...buf];
      pending = [];
      let i = 0;
      while (i < data.length) {
        const byte = data[i];
        if (byte !== IAC) { text += String.fromCharCode(byte); i++; continue; }
        const consumed = handleCmd(data.slice(i, data.length));
        if (consumed === 0) { pending = data.slice(i); break; } // wait for more bytes
        i += consumed;
      }
      return { text, events, reply: Buffer.from(reply) };
    },
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/telnet-parser.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/telnet-parser.js test/telnet-parser.test.js
git commit -m "feat(telnet): IAC/ECHO parser with chunk reassembly"
```

---

## Task 7: `telnet.js` — socket wrapper

**Files:**
- Create: `src/main/telnet.js`
- Test: `test/telnet.test.js`

- [ ] **Step 1: Write failing tests** in `test/telnet.test.js`

```js
import { test, expect } from 'vitest';
import net from 'node:net';
import { TelnetConnection } from '../src/main/telnet.js';
import { IAC, WILL, TELOPT_ECHO } from '../src/main/telnet-parser.js';

function startServer(onConn) {
  return new Promise((res) => {
    const srv = net.createServer(onConn);
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

test('connects, receives text, emits status + data', async () => {
  const srv = await startServer((sock) => sock.write('greetings'));
  const port = srv.address().port;
  const conn = new TelnetConnection();
  const data = [];
  let status = null;
  conn.on('data', (t) => data.push(t));
  conn.on('status', (s) => (status = s.state));
  await new Promise((res) => { conn.on('data', res); conn.connect('127.0.0.1', port); });
  expect(status).toBe('connected');
  expect(data.join('')).toBe('greetings');
  conn.disconnect();
  await new Promise((r) => srv.close(r));
});

test('emits echo off when server sends IAC WILL ECHO and replies on the wire', async () => {
  let got = Buffer.alloc(0);
  const srv = await startServer((sock) => {
    sock.write(Buffer.from([IAC, WILL, TELOPT_ECHO]));
    sock.on('data', (d) => { got = Buffer.concat([got, d]); });
  });
  const port = srv.address().port;
  const conn = new TelnetConnection();
  const echo = await new Promise((res) => {
    conn.on('echo', (v) => res(v));
    conn.connect('127.0.0.1', port);
  });
  expect(echo).toBe('off');
  await new Promise((r) => setTimeout(r, 50));
  expect([...got]).toEqual([IAC, 253, TELOPT_ECHO]); // IAC DO ECHO reply
  conn.disconnect();
  await new Promise((r) => srv.close(r));
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/telnet.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/main/telnet.js`

```js
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createTelnetParser } from './telnet-parser.js';

// Wraps a net.Socket with the telnet parser. Events:
//   'status' { state:'connected'|'disconnected'|'error', message? }
//   'data'   string (displayable text)
//   'echo'   'on' | 'off'
export class TelnetConnection extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.parser = createTelnetParser();
  }

  connect(host, port) {
    this.parser = createTelnetParser();
    const sock = net.createConnection({ host, port });
    this.socket = sock;
    sock.on('connect', () => this.emit('status', { state: 'connected' }));
    sock.on('data', (buf) => {
      const { text, events, reply } = this.parser.feed(buf);
      if (reply.length) sock.write(reply);
      if (text) this.emit('data', text);
      for (const ev of events) if (ev.type === 'echo') this.emit('echo', ev.value);
    });
    sock.on('error', (err) => this.emit('status', { state: 'error', message: err.message }));
    sock.on('close', () => this.emit('status', { state: 'disconnected' }));
  }

  send(text) {
    if (this.socket && !this.socket.destroyed) this.socket.write(text);
  }

  disconnect() {
    if (this.socket) { this.socket.destroy(); this.socket = null; }
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/telnet.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/telnet.js test/telnet.test.js
git commit -m "feat(telnet): net.Socket wrapper over parser"
```

---

## Task 8: `config.js` — load/save with encrypted password

**Files:**
- Create: `src/main/config.js`
- Test: `test/config.test.js`

`safeStorage` is injected so the module is testable without Electron.

- [ ] **Step 1: Write failing tests** in `test/config.test.js`

```js
import { test, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/main/config.js';

// Fake safeStorage: reversible "encryption" for the test.
const fakeSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s),
  decryptString: (b) => b.toString().replace(/^enc:/, ''),
};

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grotto-'));
}

test('loadConfig returns defaults (with GrottoMud preset) when no file exists', () => {
  const dir = tmpDir();
  const cfg = loadConfig(dir, fakeSafe);
  expect(cfg.profiles.some((p) => p.name === 'GrottoMud' && p.port === 4000)).toBe(true);
  expect(cfg.aliases).toEqual([]);
});

test('save then load round-trips and encrypts the password at rest', () => {
  const dir = tmpDir();
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.profiles = [{ id: '1', name: 'X', host: 'h', port: 23, username: 'u', password: 'secret', autologin: true }];
  saveConfig(dir, cfg, fakeSafe);

  const onDisk = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
  expect(onDisk).not.toContain('secret'); // plaintext password never on disk

  const loaded = loadConfig(dir, fakeSafe);
  expect(loaded.profiles[0].password).toBe('secret'); // decrypted back on load
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/config.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/main/config.js`

```js
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  profiles: [
    { id: 'grottomud', name: 'GrottoMud', host: '10.37.196.5', port: 4000,
      username: '', password: '', autologin: false, isPreset: true },
  ],
  aliases: [],
  triggers: [],
  hotkeys: [],
  settings: { theme: 'dark', fontSize: 14, scrollback: 5000 },
  lastProfileId: 'grottomud',
};

const FILE = 'config.json';

// Encrypt each profile password to a base64 string; blank passwords stay blank.
function encProfiles(profiles, safe) {
  const ok = safe && safe.isEncryptionAvailable();
  return profiles.map((p) => ({
    ...p,
    password: p.password && ok ? safe.encryptString(p.password).toString('base64') : '',
  }));
}
function decProfiles(profiles, safe) {
  const ok = safe && safe.isEncryptionAvailable();
  return profiles.map((p) => {
    let password = '';
    if (p.password && ok) {
      try { password = safe.decryptString(Buffer.from(p.password, 'base64')); } catch { password = ''; }
    }
    return { ...p, password };
  });
}

export function loadConfig(dir, safe) {
  const file = path.join(dir, FILE);
  if (!fs.existsSync(file)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...structuredClone(DEFAULT_CONFIG), ...raw,
      profiles: decProfiles(raw.profiles || DEFAULT_CONFIG.profiles, safe) };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(dir, cfg, safe) {
  const file = path.join(dir, FILE);
  const out = { ...cfg, profiles: encProfiles(cfg.profiles, safe) };
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/config.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole suite + commit**

Run: `npm test`
Expected: all tests PASS.

```bash
git add src/main/config.js test/config.test.js
git commit -m "feat(config): load/save with safeStorage password encryption"
```

---

## Task 9: Electron main + preload (IPC wiring)

No unit test — verified by launching the app in Task 11. Write complete code.

**Files:**
- Create: `src/main/main.js`, `src/main/preload.js`

- [ ] **Step 1: Implement** `src/main/preload.js`

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grotto', {
  connect: (host, port) => ipcRenderer.send('telnet:connect', { host, port }),
  send: (text) => ipcRenderer.send('telnet:send', text),
  disconnect: () => ipcRenderer.send('telnet:disconnect'),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  onData: (cb) => ipcRenderer.on('telnet:data', (_e, t) => cb(t)),
  onStatus: (cb) => ipcRenderer.on('telnet:status', (_e, s) => cb(s)),
  onEcho: (cb) => ipcRenderer.on('telnet:echo', (_e, v) => cb(v)),
});
```

> Note: preload runs in a CommonJS context (`require`), even though the rest of the app is ESM. This is expected for Electron preload scripts.

- [ ] **Step 2: Implement** `src/main/main.js`

```js
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelnetConnection } from './telnet.js';
import { loadConfig, saveConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;
const conn = new TelnetConnection();

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 700, backgroundColor: '#0b0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

conn.on('data', (t) => win?.webContents.send('telnet:data', t));
conn.on('status', (s) => win?.webContents.send('telnet:status', s));
conn.on('echo', (v) => win?.webContents.send('telnet:echo', v));

ipcMain.on('telnet:connect', (_e, { host, port }) => conn.connect(host, port));
ipcMain.on('telnet:send', (_e, text) => conn.send(text));
ipcMain.on('telnet:disconnect', () => conn.disconnect());
ipcMain.handle('config:load', () => loadConfig(app.getPath('userData'), safeStorage));
ipcMain.handle('config:save', (_e, cfg) => { saveConfig(app.getPath('userData'), cfg, safeStorage); return true; });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { conn.disconnect(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
```

- [ ] **Step 3: Commit**

```bash
git add src/main/main.js src/main/preload.js
git commit -m "feat(main): electron lifecycle + IPC wiring"
```

---

## Task 10: Renderer shell — HTML, CSS, xterm terminal

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/style.css`, `src/renderer/terminal.js`

- [ ] **Step 1: Implement** `src/renderer/index.html`

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'" />
  <link rel="stylesheet" href="../../node_modules/@xterm/xterm/css/xterm.css" />
  <link rel="stylesheet" href="style.css" />
  <title>Grotto Client</title>
</head>
<body>
  <div id="toolbar">
    <select id="profile"></select>
    <button id="connect">Connect</button>
    <button id="disconnect" disabled>Disconnect</button>
    <button id="settings">Settings</button>
    <span id="status">disconnected</span>
  </div>
  <div id="term"></div>
  <input id="input" type="text" autocomplete="off" placeholder="type a command…" />
  <div id="settings-panel" hidden></div>
  <script type="module" src="app.bundle.js"></script>
</body>
</html>
```

> `app.bundle.js` is the esbuild output of `app.js` (bundles the engine + xterm
> imports so bare specifiers like `@xterm/xterm` resolve). It is generated by
> `npm run build` (which `npm start` and `npm run dist` run first). Add
> `src/renderer/app.bundle.js` to `.gitignore`.

- [ ] **Step 2: Implement** `src/renderer/style.css`

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0b0e12; color: #cfe; font-family: 'IBM Plex Mono', Consolas, monospace; }
body { display: flex; flex-direction: column; }
#toolbar { display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: #11151c; border-bottom: 1px solid #1d2530; }
#toolbar button, #toolbar select { background: #1a2230; color: #cfe; border: 1px solid #2a3545; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
#status { margin-left: auto; opacity: 0.8; font-size: 12px; }
#term { flex: 1; min-height: 0; padding: 4px; }
#input { border: none; border-top: 1px solid #1d2530; background: #0e1218; color: #cfe; padding: 8px; font: inherit; outline: none; }
#input.masked { -webkit-text-security: disc; }
#settings-panel { position: fixed; inset: 40px; background: #11151c; border: 1px solid #2a3545; border-radius: 8px; padding: 16px; overflow: auto; }
```

- [ ] **Step 3: Implement** `src/renderer/terminal.js`

```js
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export function createTerminal(el) {
  const term = new Terminal({
    convertEol: false, cursorBlink: false, fontFamily: 'IBM Plex Mono, Consolas, monospace',
    fontSize: 14, scrollback: 5000,
    theme: { background: '#0b0e12', foreground: '#cfe' },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  fit.fit();
  window.addEventListener('resize', () => fit.fit());
  return {
    write: (t) => term.write(t),
    writeLine: (t) => term.writeln(t),
    focus: () => term.focus(),
  };
}
```

> `terminal.js` imports `@xterm/xterm` and `@xterm/addon-fit` as bare specifiers;
> these are resolved by the esbuild bundle step (Task 1 `npm run build`), which
> produces `src/renderer/app.bundle.js` that `index.html` loads. The xterm **CSS**
> is loaded directly via the `<link>` in `index.html` (a file path, no bundling
> needed).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/style.css src/renderer/terminal.js
git commit -m "feat(renderer): shell html/css + xterm terminal"
```

---

## Task 11: Renderer app wiring — connect, I/O, echo, history

**Files:**
- Create: `src/renderer/app.js`

- [ ] **Step 1: Implement** `src/renderer/app.js`

```js
import { createTerminal } from './terminal.js';
import { createLineBuffer } from '../engines/lines.js';
import { expandInput } from '../engines/aliases.js';
import { compileTriggers, runTriggers } from '../engines/triggers.js';
import { keyEventToString, resolveHotkey } from '../engines/hotkeys.js';
import { initSettings } from './settings-ui.js';

const term = createTerminal(document.getElementById('term'));
const input = document.getElementById('input');
const statusEl = document.getElementById('status');
const profileSel = document.getElementById('profile');
const connectBtn = document.getElementById('connect');
const disconnectBtn = document.getElementById('disconnect');

let config = await window.grotto.loadConfig();
let compiledTriggers = compileTriggers(config.triggers);
const lineBuf = createLineBuffer();
const history = [];
let histIdx = -1;
let localEcho = true;

function refreshProfiles() {
  profileSel.innerHTML = '';
  for (const p of config.profiles) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    profileSel.appendChild(o);
  }
  if (config.lastProfileId) profileSel.value = config.lastProfileId;
}
refreshProfiles();

function currentProfile() { return config.profiles.find((p) => p.id === profileSel.value); }

function sendCommand(cmd) {
  if (localEcho) term.writeLine(cmd);
  window.grotto.send(cmd + '\r\n');
}

function submitInput(raw) {
  if (raw) { history.push(raw); histIdx = history.length; }
  for (const cmd of expandInput(raw, config.aliases)) sendCommand(cmd);
}

// ---- incoming data ----
window.grotto.onData((text) => {
  term.write(text);
  for (const line of lineBuf.push(text)) {
    for (const a of runTriggers(line, compiledTriggers)) {
      if (a.type === 'command') for (const c of expandInput(a.action, config.aliases)) sendCommand(c);
      else if (a.type === 'highlight') term.writeLine('\x1b[43m\x1b[30m' + line + '\x1b[0m');
    }
  }
});

window.grotto.onStatus((s) => {
  statusEl.textContent = s.state + (s.message ? ': ' + s.message : '');
  const connected = s.state === 'connected';
  disconnectBtn.disabled = !connected;
  connectBtn.disabled = connected;
  if (s.state !== 'connected') localEcho = true;
  if (connected) maybeAutoLogin();
});

window.grotto.onEcho((v) => {
  localEcho = v === 'on';
  input.classList.toggle('masked', !localEcho);
});

// ---- auto-login (best-effort, GrottoMud-tuned) ----
let autoLoginState = null;
function maybeAutoLogin() {
  const p = currentProfile();
  autoLoginState = p && p.autologin && p.username ? 'await-name' : null;
}
// Hook into incoming lines for the prompt watch.
const origPush = lineBuf.push.bind(lineBuf);
lineBuf.push = (chunk) => {
  const lines = origPush(chunk);
  if (autoLoginState) for (const l of lines) advanceAutoLogin(l);
  return lines;
};
function advanceAutoLogin(line) {
  const p = currentProfile();
  const low = line.toLowerCase();
  if (autoLoginState === 'await-name' && low.includes('name')) {
    window.grotto.send(p.username + '\r\n'); autoLoginState = 'await-pass';
  } else if (autoLoginState === 'await-pass' && low.includes('password')) {
    window.grotto.send(p.password + '\r\n'); autoLoginState = null;
  }
}

// ---- input box ----
input.addEventListener('keydown', (e) => {
  const keyStr = keyEventToString(e);
  const hk = resolveHotkey(keyStr, config.hotkeys);
  if (hk && document.activeElement === input && e.key.length !== 1) {
    e.preventDefault(); for (const c of expandInput(hk, config.aliases)) sendCommand(c); return;
  }
  if (e.key === 'Enter') { submitInput(input.value); input.value = ''; }
  else if (e.key === 'ArrowUp') { if (histIdx > 0) input.value = history[--histIdx]; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { if (histIdx < history.length - 1) input.value = history[++histIdx]; else { histIdx = history.length; input.value = ''; } e.preventDefault(); }
});

// global hotkeys (numpad/F-keys) even when input not focused
window.addEventListener('keydown', (e) => {
  if (document.activeElement === input) return;
  const hk = resolveHotkey(keyEventToString(e), config.hotkeys);
  if (hk) { e.preventDefault(); for (const c of expandInput(hk, config.aliases)) sendCommand(c); }
});

// ---- toolbar ----
connectBtn.onclick = () => {
  const p = currentProfile();
  config.lastProfileId = p.id; window.grotto.saveConfig(config);
  window.grotto.connect(p.host, p.port);
};
disconnectBtn.onclick = () => window.grotto.disconnect();

document.getElementById('settings').onclick = () => {
  initSettings(document.getElementById('settings-panel'), config, async (updated) => {
    config = updated;
    compiledTriggers = compileTriggers(config.triggers);
    await window.grotto.saveConfig(config);
    refreshProfiles();
  });
};

input.focus();
```

- [ ] **Step 2: Manual verification**

Run: `npm start`
Expected: window opens; select GrottoMud → Connect → the "Alternate Reality" greeting renders in color; typing `look` + Enter shows the room; Up-arrow recalls last command; status bar shows `connected`. At the password prompt during login the input box masks and the password is not echoed.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(renderer): wire I/O, echo masking, history, hotkeys, auto-login"
```

---

## Task 12: Settings UI — profiles/aliases/triggers/hotkeys CRUD

**Files:**
- Create: `src/renderer/settings-ui.js`

- [ ] **Step 1: Implement** `src/renderer/settings-ui.js`

```js
// Minimal tabbed CRUD over the config object. Calls onSave(updatedConfig) on every change.
const TABS = [
  { key: 'profiles', fields: ['name', 'host', 'port', 'username', 'password', 'autologin'] },
  { key: 'aliases', fields: ['key', 'command', 'enabled'] },
  { key: 'triggers', fields: ['pattern', 'isRegex', 'type', 'action', 'enabled'] },
  { key: 'hotkeys', fields: ['key', 'command', 'enabled'] },
];

export function initSettings(panel, config, onSave) {
  panel.hidden = false;
  let active = 'profiles';
  const cfg = structuredClone(config);

  function render() {
    panel.innerHTML = '';
    const bar = document.createElement('div');
    for (const t of TABS) {
      const b = document.createElement('button');
      b.textContent = t.key; b.onclick = () => { active = t.key; render(); };
      bar.appendChild(b);
    }
    const close = document.createElement('button');
    close.textContent = 'Close'; close.style.float = 'right';
    close.onclick = () => { panel.hidden = true; };
    bar.appendChild(close);
    panel.appendChild(bar);

    const tab = TABS.find((t) => t.key === active);
    const list = cfg[active];
    for (let i = 0; i < list.length; i++) {
      const row = document.createElement('div');
      for (const f of tab.fields) {
        const val = list[i][f];
        const inp = document.createElement('input');
        if (typeof val === 'boolean') { inp.type = 'checkbox'; inp.checked = val; }
        else { inp.type = f === 'password' ? 'password' : 'text'; inp.value = val ?? ''; inp.placeholder = f; }
        inp.onchange = () => {
          list[i][f] = inp.type === 'checkbox' ? inp.checked : (f === 'port' ? Number(inp.value) : inp.value);
          onSave(structuredClone(cfg));
        };
        row.appendChild(inp);
      }
      const del = document.createElement('button');
      del.textContent = '×'; del.onclick = () => { list.splice(i, 1); onSave(structuredClone(cfg)); render(); };
      row.appendChild(del);
      panel.appendChild(row);
    }
    const add = document.createElement('button');
    add.textContent = '+ add';
    add.onclick = () => {
      const blank = { id: String(Date.now()) };
      for (const f of tab.fields) blank[f] = typeof (list[0]?.[f]) === 'boolean' ? false : '';
      if (active !== 'profiles') blank.enabled = true;
      list.push(blank); onSave(structuredClone(cfg)); render();
    };
    panel.appendChild(add);
  }
  render();
}
```

- [ ] **Step 2: Manual verification**

Run: `npm start` → Settings → add an alias `k` = `kill $1`, save, close. Type `k goblin` → sends `kill goblin`. Add a hotkey `Numpad8` = `north`; press numpad-8 → walks north. Add a trigger and confirm it fires. Restart the app → settings persisted.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/settings-ui.js
git commit -m "feat(renderer): settings CRUD for profiles/aliases/triggers/hotkeys"
```

---

## Task 13: Packaging — electron-builder (all platforms)

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Implement** `electron-builder.yml`

```yaml
appId: com.burzhum.grottoclient
productName: Grotto Client
directories:
  output: dist
files:
  - src/**/*
  - node_modules/**/*
  - package.json
win:
  target: [nsis, portable]
mac:
  target: [dmg]
  category: public.app-category.games
linux:
  target: [AppImage, deb]
  category: Game
```

- [ ] **Step 2: Build for the current OS**

Run: `npm run dist`
Expected: installer(s) produced in `dist/` for your OS (Windows: `.exe` NSIS + portable). Launch the built app and connect to GrottoMud to confirm the packaged build works.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "build: electron-builder config for win/mac/linux"
```

---

## Task 14: GitHub Actions release workflow (all-platform builds)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Implement** `.github/workflows/release.yml`

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run dist
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
            dist/*.deb
```

- [ ] **Step 2: Push repo to GitHub (burzhum) + tag**

```bash
git remote add origin https://github.com/burzhum/grotto-client.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

Expected: Actions runs three jobs (win/mac/linux); a GitHub Release `v0.1.0` appears with installers for all three platforms attached.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: all-platform release workflow"
```

---

## Task 15: README for sharers

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write** `README.md`

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for users and sharers"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** telnet/IAC/ECHO/chunk (T6/T7), local-echo + masking (T11),
  aliases (T3), triggers (T4), hotkeys (T5), profiles + safeStorage (T8/T9),
  auto-login best-effort (T11), xterm ANSI + scrollback (T10), all-platform
  packaging + CI (T13/T14), README (T15). Each spec section maps to a task.
- **Type consistency:** `expandInput`, `compileTriggers`/`runTriggers`,
  `keyEventToString`/`resolveHotkey`, `createLineBuffer`, `createTelnetParser`,
  `TelnetConnection`, `loadConfig`/`saveConfig` are used with identical signatures
  across tasks.
- **Phase 2 (out of scope here):** automapper, inline gag/recolor (custom renderer),
  logging, speedwalk, tabs, sound triggers, configurable command separator,
  auto-reconnect.
```
