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
