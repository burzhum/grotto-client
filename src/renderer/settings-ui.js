// Minimal tabbed CRUD over the config object. Calls onSave(updatedConfig) on every change.
const TABS = [
  { key: 'profiles', fields: ['name', 'host', 'port', 'username', 'password', 'autologin'] },
  { key: 'aliases', fields: ['key', 'command', 'enabled'] },
  { key: 'triggers', fields: ['pattern', 'isRegex', 'type', 'action', 'enabled'] },
  { key: 'hotkeys', fields: ['key', 'command', 'enabled'] },
];

export function initSettings(panel, config, onSave) {
  panel.hidden = false;
  let active = 'profiles';
  const cfg = structuredClone(config);

  function render() {
    panel.innerHTML = '';
    const bar = document.createElement('div');
    for (const t of TABS) {
      const b = document.createElement('button');
      b.textContent = t.key; b.onclick = () => { active = t.key; render(); };
      bar.appendChild(b);
    }
    const close = document.createElement('button');
    close.textContent = 'Close'; close.style.float = 'right';
    close.onclick = () => { panel.hidden = true; };
    bar.appendChild(close);
    panel.appendChild(bar);

    const tab = TABS.find((t) => t.key === active);
    const list = cfg[active];
    for (let i = 0; i < list.length; i++) {
      const row = document.createElement('div');
      for (const f of tab.fields) {
        const val = list[i][f];
        const inp = document.createElement('input');
        if (typeof val === 'boolean') { inp.type = 'checkbox'; inp.checked = val; }
        else { inp.type = f === 'password' ? 'password' : 'text'; inp.value = val ?? ''; inp.placeholder = f; }
        inp.onchange = () => {
          list[i][f] = inp.type === 'checkbox' ? inp.checked : (f === 'port' ? Number(inp.value) : inp.value);
          onSave(structuredClone(cfg));
        };
        row.appendChild(inp);
      }
      const del = document.createElement('button');
      del.textContent = '×'; del.onclick = () => { list.splice(i, 1); onSave(structuredClone(cfg)); render(); };
      row.appendChild(del);
      panel.appendChild(row);
    }
    const add = document.createElement('button');
    add.textContent = '+ add';
    add.onclick = () => {
      const blank = { id: String(Date.now()) };
      for (const f of tab.fields) blank[f] = typeof (list[0]?.[f]) === 'boolean' ? false : '';
      if (active !== 'profiles') blank.enabled = true;
      list.push(blank); onSave(structuredClone(cfg)); render();
    };
    panel.appendChild(add);
  }
  render();
}
