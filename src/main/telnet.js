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
