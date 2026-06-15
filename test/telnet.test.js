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
