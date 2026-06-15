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
