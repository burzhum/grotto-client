// Strip ANSI CSI sequences (colors, cursor moves) for trigger matching.
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

// Accumulate raw text chunks and yield complete lines (ANSI stripped, CR trimmed).
// A trailing partial line is buffered until its newline arrives.
export function createLineBuffer() {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk;
      const out = [];
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const raw = buf.slice(0, idx).replace(/\r$/, '');
        out.push(stripAnsi(raw));
        buf = buf.slice(idx + 1);
      }
      return out;
    },
  };
}
