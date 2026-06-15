// Pre-compile triggers into matchers. Invalid regex is captured as `.error`
// (the trigger is kept so the UI can flag it) and never matches.
export function compileTriggers(triggers) {
  return triggers.map((t) => {
    if (t.isRegex) {
      try {
        const re = new RegExp(t.pattern);
        return { trigger: t, test: (line) => re.test(line) };
      } catch (e) {
        return { trigger: t, error: e.message, test: () => false };
      }
    }
    return { trigger: t, test: (line) => line.includes(t.pattern) };
  });
}

// Run a single incoming line against compiled triggers; return the fired actions.
export function runTriggers(line, compiled) {
  const actions = [];
  for (const c of compiled) {
    if (c.error || !c.trigger.enabled) continue;
    if (c.test(line)) actions.push({ type: c.trigger.type, action: c.trigger.action });
  }
  return actions;
}
