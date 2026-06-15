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
