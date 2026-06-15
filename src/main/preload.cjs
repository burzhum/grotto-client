const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grotto', {
  connect: (host, port) => ipcRenderer.send('telnet:connect', { host, port }),
  send: (text) => ipcRenderer.send('telnet:send', text),
  disconnect: () => ipcRenderer.send('telnet:disconnect'),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  onData: (cb) => { ipcRenderer.removeAllListeners('telnet:data'); ipcRenderer.on('telnet:data', (_e, t) => cb(t)); },
  onStatus: (cb) => { ipcRenderer.removeAllListeners('telnet:status'); ipcRenderer.on('telnet:status', (_e, s) => cb(s)); },
  onEcho: (cb) => { ipcRenderer.removeAllListeners('telnet:echo'); ipcRenderer.on('telnet:echo', (_e, v) => cb(v)); },
});
