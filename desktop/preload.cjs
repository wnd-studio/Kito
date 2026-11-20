const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wndWindow', {
  minimize: () => ipcRenderer.send('wnd:window-control', 'minimize'),
  maximize: () => ipcRenderer.send('wnd:window-control', 'maximize'),
  close: () => ipcRenderer.send('wnd:window-control', 'close'),
  isMaximized: () => ipcRenderer.invoke('wnd:window-maximized'),
  onMaximizedChange: callback => {
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('wnd:window-maximized', listener);
    return () => ipcRenderer.removeListener('wnd:window-maximized', listener);
  },
  startupStatus: () => ipcRenderer.invoke('wnd:startup-status'),
  checkUpdates: () => ipcRenderer.invoke('wnd:updates-check'),
  openUpdate: () => ipcRenderer.invoke('wnd:updates-open'),
  setStartup: enabled => ipcRenderer.invoke('wnd:startup-set', enabled)
});

contextBridge.exposeInMainWorld('wndBank', {
  saveCredentials: (clientId, clientSecret) => ipcRenderer.invoke('wnd:bank-save', { clientId, clientSecret }),
  clearCredentials: () => ipcRenderer.invoke('wnd:bank-clear')
});
