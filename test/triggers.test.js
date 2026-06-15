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
