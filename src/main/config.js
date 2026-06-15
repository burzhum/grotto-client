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
// If safeStorage is unavailable the password is stored blank (not plaintext) — v1 best-effort; a future version should surface a warning.
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
