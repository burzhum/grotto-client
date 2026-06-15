export const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251;
export const SB = 250, SE = 240, TELOPT_ECHO = 1;

// Stateful telnet parser. feed(Buffer) -> { text, events, reply }:
//   text   = displayable string with IAC sequences removed (IAC IAC -> 0xFF)
//   events = [{ type:'echo', value:'on'|'off' }, ...]
//   reply  = Buffer of option negotiation bytes to send back to the server
// Holds a partial IAC sequence across chunk boundaries.
export function createTelnetParser() {
  let pending = []; // bytes of an in-progress IAC sequence

  return {
    feed(buf) {
      let text = '';
      const events = [];
      const reply = [];

      const handleCmd = (seq) => {
        // seq starts with IAC. Returns true if a full command was consumed.
        if (seq.length < 2) return 0; // need at least cmd byte
        const cmd = seq[1];
        if (cmd === IAC) { text += '\xFF'; return 2; }      // escaped 0xFF
        if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
          if (seq.length < 3) return 0;                     // need the option byte
          const opt = seq[2];
          if (opt === TELOPT_ECHO) {
            if (cmd === WILL) { reply.push(IAC, DO, TELOPT_ECHO); events.push({ type: 'echo', value: 'off' }); }
            else if (cmd === WONT) { reply.push(IAC, DONT, TELOPT_ECHO); events.push({ type: 'echo', value: 'on' }); }
            // DO/DONT ECHO from server about our echo: ignore (we don't echo to them).
          } else {
            // Refuse anything we don't implement.
            if (cmd === WILL) reply.push(IAC, DONT, opt);
            else if (cmd === DO) reply.push(IAC, WONT, opt);
          }
          return 3;
        }
        if (cmd === SB) {
          // Subnegotiation: consume up to IAC SE; if incomplete, wait for more.
          for (let i = 2; i < seq.length - 1; i++) {
            if (seq[i] === IAC && seq[i + 1] === SE) return i + 2;
          }
          return 0; // incomplete
        }
        // Other 2-byte commands (NOP, GA, etc.) — consume and ignore.
        return 2;
      };

      let data = pending.length ? [...pending, ...buf] : [...buf];
      pending = [];
      let i = 0;
      while (i < data.length) {
        const byte = data[i];
        if (byte !== IAC) { text += String.fromCharCode(byte); i++; continue; }
        const consumed = handleCmd(data.slice(i, data.length));
        if (consumed === 0) { pending = data.slice(i); break; } // wait for more bytes
        i += consumed;
      }
      return { text, events, reply: Buffer.from(reply) };
    },
  };
}
