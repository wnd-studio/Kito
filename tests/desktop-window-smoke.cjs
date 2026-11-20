const { join, resolve } = require('node:path');
const { existsSync, readdirSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const playwrightCache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx');
const playwrightDirectory = readdirSync(playwrightCache).map(directory =>
  join(playwrightCache, directory, 'node_modules', 'playwright')
).find(existsSync);
if (!playwrightDirectory) throw Error('Playwright não encontrado no cache do npm.');

const { _electron: electron } = require(playwrightDirectory);
const executablePath = process.env.WND_TEST_EXECUTABLE || join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const isolatedAppData = mkdtempSync(join(tmpdir(), 'wnd-electron-test-'));
const testEnvironment = {
  ...process.env,
  WND_TEST_USER_DATA_DIR: join(isolatedAppData, 'WND Central'),
  PLUGGY_CLIENT_ID: '',
  PLUGGY_CLIENT_SECRET: ''
};

async function checkHeader(page, width) {
  const result = await page.evaluate(() => {
    const box = selector => {
      const { left, right, top, bottom } = document.querySelector(selector).getBoundingClientRect();
      return { left, right, top, bottom };
    };
    return {
      header: box('.topbar'),
      left: box('.topbar-left'),
      right: box('.topbar-right'),
      controls: box('.window-controls'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      exposedApi: typeof window.wndWindow?.maximize === 'function'
    };
  });
  assert.ok(result.exposedApi, 'API da janela não disponível no preload');
  assert.ok(!result.overflow, `Overflow horizontal com janela de ${width}px`);
  assert.ok(result.header.left <= result.left.left && result.left.right <= result.right.left + 1,
    `Breadcrumb colidiu com ações em ${width}px`);
  assert.ok(result.right.right <= result.controls.left + 1,
    `Ações colidiram com botões da janela em ${width}px`);
  assert.ok(result.controls.right <= result.header.right + 1,
    `Botões fora do cabeçalho em ${width}px`);
  assert.ok(result.controls.top >= result.header.top && result.controls.bottom <= result.header.bottom,
    `Botões cortados verticalmente em ${width}px`);
}

(async () => {
  let application;
  try {
    const args = process.env.WND_TEST_EXECUTABLE ? [] : [join(root, 'desktop', 'main.mjs')];
    application = await electron.launch({ executablePath, args, cwd: root, env: testEnvironment });
    const page = await application.firstWindow();
    await page.locator('.dashboard-intro').waitFor({ timeout: 30000 });
    await checkHeader(page, 1440);

    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 700));
    await checkHeader(page, 900);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
    await page.waitForFunction(() => innerWidth <= 470);
    await checkHeader(page, 450);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    await page.waitForFunction(() => innerWidth >= 850);
    if (process.env.WND_WINDOW_SCREENSHOT) {
      await page.screenshot({ path: process.env.WND_WINDOW_SCREENSHOT, animations: 'disabled' });
    }

    await page.locator('[data-window-action="maximize"]').click();
    await page.waitForFunction(() => document.querySelector('[data-window-action="maximize"]').classList.contains('is-maximized'));
    assert.equal(await page.locator('[data-window-action="maximize"]').getAttribute('aria-label'), 'Restaurar janela');
    await page.locator('[data-window-action="maximize"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-window-action="maximize"]').classList.contains('is-maximized'));

    await page.locator('[data-window-action="minimize"]').click();
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), true);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());

    const storage = await application.evaluate(({ app }) => ({
      userData: app.getPath('userData'),
      database: process.env.VAGAS_DB_PATH,
      outbox: process.env.VAGAS_OUTBOX_PATH
    }));
    const { userData } = storage;
    assert.ok(userData.toLowerCase().startsWith(isolatedAppData.toLowerCase()), 'Teste deve usar armazenamento privado isolado');
    assert.equal(storage.database, join(userData, 'data', 'vagas.sqlite'), 'Teste deve usar SQLite isolado');
    assert.equal(storage.outbox, join(userData, 'outbox'), 'Teste deve usar pasta de saída isolada');
    await page.locator('a[data-view="finance"]').first().click();
    await page.locator('[data-action="add-bank-credentials"]').click();
    await page.locator('input[name="clientId"]').fill('fake-client-id');
    await page.locator('input[name="clientSecret"]').fill('fake-client-secret');
    await page.locator('form[data-form="bank-credentials"] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('.bank-hero h2')?.textContent.includes('Pluggy configurado'));
    const encryptedPath = join(userData, 'pluggy-credentials.bin');
    assert.ok(existsSync(encryptedPath), 'Credenciais criptografadas não foram persistidas');
    assert.ok(!readFileSync(encryptedPath).includes(Buffer.from('fake-client-secret')), 'Secret armazenado em texto puro');

    await page.locator('[data-window-action="close"]').click();
    let hidden;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      hidden = await application.evaluate(({ BrowserWindow }) => ({
        visible: BrowserWindow.getAllWindows()[0].isVisible(),
        destroyed: BrowserWindow.getAllWindows()[0].isDestroyed()
      }));
      if (!hidden.visible) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(hidden.visible, false, 'Fechar deve ocultar a janela na bandeja');
    assert.equal(hidden.destroyed, false, 'Fechar não deve encerrar os serviços em segundo plano');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await page.locator('.bank-hero h2').waitFor();

    const closed = application.waitForEvent('close', { timeout: 10000 });
    await application.evaluate(({ app }) => app.quit());
    await closed;
    application = null;

    application = await electron.launch({ executablePath, args, cwd: root, env: testEnvironment });
    const reopened = await application.firstWindow();
    reopened.on('dialog', dialog => dialog.accept());
    await reopened.locator('a[data-view="finance"]').first().click();
    await reopened.locator('.bank-hero h2').getByText('Pluggy configurado. Adicione suas conexões.').waitFor();
    await reopened.locator('[data-action="add-bank-credentials"]').click();
    await reopened.locator('[data-action="clear-bank-credentials"]').click();
    await reopened.locator('.bank-hero h2').getByText('Conecte suas contas pelo Pluggy').waitFor();
    assert.equal(existsSync(encryptedPath), false, 'Arquivo de credenciais não foi excluído');
    console.log('PASSOU: controles da janela, persistência, redimensionamento e zoom real de 200% sem cortes.');
  } finally {
    if (application) await application.close().catch(() => {});
    rmSync(isolatedAppData, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
