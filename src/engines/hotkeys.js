// Normalize a DOM KeyboardEvent into a stable string like "Ctrl+1", "F1", "Numpad8".
export function keyEventToString(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  // Numpad keys are identified by code so they're distinct from the number row.
  const isNumpad = typeof e.code === 'string' && e.code.startsWith('Numpad');
  parts.push(isNumpad ? e.code : e.key);
  return parts.join('+');
}

// Look up the command bound to a key string. Returns null if none / disabled.
export function resolveHotkey(keyStr, hotkeys) {
  const h = hotkeys.find((h) => h.enabled && h.key === keyStr);
  return h ? h.command : null;
}
