import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export function createTerminal(el) {
  const term = new Terminal({
    convertEol: false, cursorBlink: false, fontFamily: 'IBM Plex Mono, Consolas, monospace',
    fontSize: 14, scrollback: 5000,
    theme: { background: '#0b0e12', foreground: '#cfe' },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  fit.fit();
  window.addEventListener('resize', () => fit.fit());
  return {
    write: (t) => term.write(t),
    writeLine: (t) => term.writeln(t),
    focus: () => term.focus(),
  };
}
