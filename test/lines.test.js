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
