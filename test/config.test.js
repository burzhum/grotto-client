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
