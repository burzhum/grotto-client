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
