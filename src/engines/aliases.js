// Split a command string into individual commands on the separator (default ';').
export function splitCommands(s, sep = ';') {
  return s.split(sep).map((c) => c.trim()).filter((c) => c.length > 0);
}

// Expand an input line against the alias list. Returns the list of commands to send.
// Matches on the FIRST whitespace-delimited word. $1..$9 = positional args, $* = all.
export function expandInput(input, aliases, sep = ';') {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/);
  const word = parts[0];
  const args = parts.slice(1);
  const alias = aliases.find((a) => a.enabled && a.key === word);
  if (!alias) return [trimmed];
  const expanded = alias.command
    .replace(/\$([1-9])/g, (_, n) => args[Number(n) - 1] ?? '')
    .replace(/\$\*/g, args.join(' '));
  return splitCommands(expanded, sep);
}
