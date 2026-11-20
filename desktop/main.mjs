import { app, BrowserWindow, dialog, ipcMain, shell, safeStorage, Notification, Tray, Menu } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkLatestRelease } from './update-check.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const isolatedTestData = process.env.WND_TEST_USER_DATA_DIR
  ? resolve(process.env.WND_TEST_USER_DATA_DIR)
  : null;
if (isolatedTestData) {
  mkdirSync(isolatedTestData, { recursive: true });
  app.setPath('userData', isolatedTestData);
} else {
  // Mantém a base e as credenciais no perfil anterior ao rebranding.
  const appData = app.getPath('appData');
  const legacyNames = ['WND Central', 'wnd-vagas'];
  const existing = legacyNames.find(name => {
    const dir = join(appData, name);
    return ['data/vagas.sqlite', 'gmail-credentials.bin', 'pluggy-credentials.bin', 'startup-configured']
      .some(file => existsSync(join(dir, file)));
  });
  const userData = join(appData, existing || 'Kito');
  mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
}
const hasSingleInstance = app.requestSingleInstanceLock();
let mainWindow;
let localServer;
let pluggyCredentials = null;
let tray;
let quitting = false;
let jobNotificationTimer;
let bankSyncTimer;
let bankStartupTimer;
let lastBankSyncAttempt = 0;
const notificationsInFlight = new Map();
const startupExecutable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

function showMainWindow(view = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (view) mainWindow.webContents.executeJavaScript(`location.hash = '#${view}'`).catch(() => {});
}

function loginSettings() {
  const supported = process.platform === 'win32' && app.isPackaged && !isolatedTestData;
  return { supported, enabled: supported && app.getLoginItemSettings({
    path:startupExecutable, args:['--hidden']
  }).openAtLogin };
}

function setLoginEnabled(enabled) {
  if (!loginSettings().supported) throw Error('Inicialização automática disponível no aplicativo Windows instalado.');
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path:startupExecutable, args:['--hidden'] });
  updateTrayMenu();
  return loginSettings();
}

function initializeStartup() {
  if (!loginSettings().supported) return;
  const marker = join(app.getPath('userData'), 'startup-configured');
  if (existsSync(marker)) return;
  // Novas instalações respeitam a escolha do usuário. Instalações anteriores
  // já possuem o marcador, portanto mantêm a preferência registrada no Windows.
  writeFileSync(marker, 'configured\n', { mode: 0o600 });
}

function updateTrayMenu() {
  if (!tray) return;
  const startup = loginSettings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label:'Abrir Kito', click:() => showMainWindow() },
    { label:'Iniciar com o Windows', type:'checkbox', checked:startup.enabled, enabled:startup.supported,
      click:item => setLoginEnabled(item.checked) },
    { type:'separator' },
    { label:'Encerrar Kito', click:() => app.quit() }
  ]));
}

function createTray() {
  try {
    tray = new Tray(join(projectRoot, 'desktop', 'app-icon.ico'));
    tray.setToolTip('Kito · seu dia, num lugar só');
    tray.on('double-click', () => showMainWindow());
    updateTrayMenu();
  } catch (error) {
    console.error(`Não foi possível iniciar a bandeja: ${error.message}`);
    tray = null;
  }
}

async function notifyNewJobs() {
  if (isolatedTestData || !Notification.isSupported()) return;
  const { desktopNotifications, markDesktopNotified } = await import('../core.mjs');
  for (const job of desktopNotifications(4)) {
    const previousAttempt = notificationsInFlight.get(job.id);
    if (previousAttempt && Date.now() - previousAttempt < 15 * 60000) continue;
    notificationsInFlight.set(job.id, Date.now());
    const notification = new Notification({
      title:`Nova vaga · ${job.company}`,
      body:job.title,
      silent:false
    });
    const acknowledge = () => {
      notificationsInFlight.delete(job.id);
      try { markDesktopNotified(job.id); }
      catch(error) { console.error(`Aviso de vaga: ${error.message}`); }
    };
    notification.once('show', acknowledge);
    notification.on('click', () => { acknowledge(); showMainWindow('vagas'); });
    notification.once('failed', (_,error) => {
      notificationsInFlight.delete(job.id);
      console.error(`Notificação Windows: ${error}`);
    });
    try { notification.show(); }
    catch(error) { notificationsInFlight.delete(job.id); console.error(`Notificação Windows: ${error.message}`); }
  }
}

async function syncBanksIfDue() {
  if (isolatedTestData || Date.now() - lastBankSyncAttempt < 6 * 3600000) return;
  const { bankSnapshot, syncBanking } = await import('../banking.mjs');
  const snapshot = bankSnapshot();
  if (!snapshot.configured || !snapshot.items?.length) return;
  const fresh = snapshot.items.every(item => item.last_synced_at && !item.last_error &&
    Date.now() - Date.parse(item.last_synced_at) < 24 * 3600000);
  if (fresh) return;
  lastBankSyncAttempt = Date.now();
  try { await syncBanking(); }
  catch(error) { console.error(`Sincronização automática Pluggy: ${error.message}`); }
}

function credentialsFile() {
  return join(app.getPath('userData'), 'pluggy-credentials.bin');
}

function loadPluggyCredentials() {
  if (!existsSync(credentialsFile()) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const decoded = JSON.parse(safeStorage.decryptString(readFileSync(credentialsFile())));
    if (typeof decoded.clientId !== 'string' || typeof decoded.clientSecret !== 'string') return null;
    return decoded;
  } catch {
    return null;
  }
}

function savePluggyCredentials(credentials) {
  if (!safeStorage.isEncryptionAvailable()) throw Error('A proteção de credenciais do Windows está indisponível.');
  const file = credentialsFile();
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(credentials)), { mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function gmailCredentialsFile() {
  return join(app.getPath('userData'), 'gmail-credentials.bin');
}

function loadGmailCredentials() {
  if (!existsSync(gmailCredentialsFile())) return {};
  if (!safeStorage.isEncryptionAvailable()) throw Error('A proteção de credenciais do Windows está indisponível.');
  try {
    const settings = JSON.parse(safeStorage.decryptString(readFileSync(gmailCredentialsFile())));
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  } catch {
    throw Error('Não foi possível ler a conexão Gmail protegida pelo Windows.');
  }
}

function saveGmailCredentials(settings) {
  if (!safeStorage.isEncryptionAvailable()) throw Error('A proteção de credenciais do Windows está indisponível.');
  const file = gmailCredentialsFile();
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(settings)), { mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function notifyRecruiterReply({ company, title, from }) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: `${company || 'Recrutador'} respondeu`,
    body: `${title || 'Candidatura'} · ${from || 'Nova mensagem'}`,
    silent: false
  });
  notification.on('click', () => {
    showMainWindow('correio');
  });
  notification.show();
}

if (!hasSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

function configureStorage() {
  if (isolatedTestData) {
    process.env.VAGAS_DB_PATH = join(isolatedTestData, 'data', 'vagas.sqlite');
    process.env.VAGAS_OUTBOX_PATH = join(isolatedTestData, 'outbox');
    process.env.VAGAS_PORT = '0';
    process.env.VAGAS_DESKTOP = '1';
    return;
  }
  // Em desenvolvimento, mantém o banco do projeto. Em instalações novas,
  // mantém os dados no perfil do Windows, independente da pasta de instalação.
  // Preserva a localização legada para instalações que já criaram o marcador.
  const projectDatabase = join(projectRoot, 'data', 'vagas.sqlite');
  const desktopDatabase = join(app.getPath('desktop'), 'Vagas', 'data', 'vagas.sqlite');
  const standaloneDatabase = join(app.getPath('userData'), 'data', 'vagas.sqlite');
  const usedLegacyStorage = existsSync(join(app.getPath('userData'), 'startup-configured'));
  const legacyDatabase = [projectDatabase, desktopDatabase].find(existsSync);
  const database = !app.isPackaged ? projectDatabase
    : existsSync(standaloneDatabase) ? standaloneDatabase
    : usedLegacyStorage && legacyDatabase ? legacyDatabase : standaloneDatabase;

  process.env.VAGAS_DB_PATH = database;
  process.env.VAGAS_OUTBOX_PATH = database === standaloneDatabase
    ? join(app.getPath('userData'), 'outbox')
    : join(dirname(dirname(database)), 'outbox');
  process.env.VAGAS_PORT = '0';
  process.env.VAGAS_DESKTOP = '1';
}

function openExternal(url) {
  try {
    const target = new URL(url);
    if (['https:', 'http:'].includes(target.protocol)) {
      shell.openExternal(target.toString()).catch(() => {});
    }
  } catch {
    // URLs inválidas permanecem bloqueadas.
  }
}

async function createDesktopWindow() {
  configureStorage();
  const { setPluggyCredentialsProvider } = await import('../pluggy.mjs');
  pluggyCredentials = loadPluggyCredentials();
  const refreshPluggyProvider = () => setPluggyCredentialsProvider(() => pluggyCredentials || {
    clientId: process.env.PLUGGY_CLIENT_ID,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET
  });
  refreshPluggyProvider();

  const senderIsApp = event => mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
  ipcMain.handle('wnd:updates-check', async event => {
    if (!senderIsApp(event)) throw Error('Origem inválida.');
    return checkLatestRelease(app.getVersion());
  });
  ipcMain.handle('wnd:updates-open', event => {
    if (!senderIsApp(event)) throw Error('Origem inválida.');
    return shell.openExternal('https://github.com/wnd-studio/Kito/releases/latest');
  });
  ipcMain.handle('wnd:startup-status', event => {
    if (!senderIsApp(event)) throw Error('Origem inválida.');
    return loginSettings();
  });
  ipcMain.handle('wnd:startup-set', (event, enabled) => {
    if (!senderIsApp(event)) throw Error('Origem inválida.');
    if (typeof enabled !== 'boolean') throw Error('Preferência inválida.');
    return setLoginEnabled(enabled);
  });
  ipcMain.handle('wnd:bank-save', (event, data) => {
    if (!senderIsApp(event)) throw Error('Origem inválida.');
    const clientId = typeof data?.clientId === 'string' ? data.clientId.trim() : '';
    const clientSecret = typeof data?.clientSecret === 'string' ? data.clientSecret.trim() : '';
    if (!clientId || !clientSecret || clientId.length > 200 || clientSecret.length > 500) {
      throw Error('Informe o Client ID e o Client Secret da aplicação Pluggy.');
    }
    savePluggyCredentials({ clientId, clientSecret });
    pluggyCredentials = { clientId, clientSecret };
    refreshPluggyProvider();
    return { configured: true };
  });
  ipcMain.handle('wnd:bank-clear', event => {
    if (!senderIsApp(event)) throw Error('Origem inválida.');
    rmSync(credentialsFile(), { force: true });
    pluggyCredentials = null;
    refreshPluggyProvider();
    return { configured: Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET) };
  });
  const backend = await import('../server.mjs');
  const { GmailService } = await import('../gmail.mjs');
  backend.setGmailService(new GmailService({
    readSettings: loadGmailCredentials,
    writeSettings: saveGmailCredentials,
    openBrowser: url => shell.openExternal(url)
  }), notifyRecruiterReply);
  localServer = backend.server;
  const localUrl = await backend.serverReady;
  const localOrigin = new URL(localUrl).origin;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    center: true,
    show: false,
    title: 'Kito',
    icon: join(projectRoot, 'desktop', 'app-icon.png'),
    backgroundColor: '#141615',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (URL.canParse(url) && new URL(url).origin !== localOrigin) openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (URL.canParse(url) && new URL(url).origin === localOrigin) return;
    event.preventDefault();
    openExternal(url);
  });
  const syncMaximized = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('wnd:window-maximized', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', syncMaximized);
  mainWindow.on('unmaximize', syncMaximized);
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show();
  });
  mainWindow.on('close', event => {
    if (!quitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(localUrl);
}

if (hasSingleInstance) {
  ipcMain.on('wnd:window-control', (event, action) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    if (action === 'close') mainWindow.close();
  });
  ipcMain.handle('wnd:window-maximized', event => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
    return mainWindow.isMaximized();
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId('br.net.wnd.central');
    await createDesktopWindow();
    try { initializeStartup(); }
    catch (error) { console.error(`Inicialização com Windows: ${error.message}`); }
    createTray();
    await notifyNewJobs();
    jobNotificationTimer = setInterval(() => {
      notifyNewJobs().catch(error => console.error(`Notificação de vaga: ${error.message}`));
    }, 45000);
    if (!isolatedTestData) {
      bankStartupTimer = setTimeout(() => syncBanksIfDue().catch(error =>
        console.error(`Sincronização bancária: ${error.message}`)), 30000);
      bankSyncTimer = setInterval(() => syncBanksIfDue().catch(error =>
        console.error(`Sincronização bancária: ${error.message}`)), 3600000);
    }
  }).catch(error => {
    dialog.showErrorBox('Não foi possível iniciar o Kito', error.message);
    app.quit();
  });
  app.on('activate', () => showMainWindow());
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', () => {
    quitting = true;
    clearInterval(jobNotificationTimer);
    clearTimeout(bankStartupTimer);
    clearInterval(bankSyncTimer);
    localServer?.close();
  });
}
