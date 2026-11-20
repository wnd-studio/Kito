const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { mkdtempSync, readdirSync, existsSync, rmSync } = require('node:fs');
const { tmpdir, homedir } = require('node:os');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cacheRoot = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx');

function findPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) return require(process.env.PLAYWRIGHT_PATH);
  for (const dir of existsSync(cacheRoot) ? readdirSync(cacheRoot) : []) {
    const modulePath = join(cacheRoot, dir, 'node_modules', 'playwright');
    if (existsSync(modulePath)) return require(modulePath);
  }
  throw Error('Playwright não encontrado no cache do npm.');
}

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function main() {
  const { chromium } = findPlaywright();
  assert.ok(existsSync(edge), 'Microsoft Edge não encontrado');
  const folder = mkdtempSync(join(tmpdir(), 'wnd-central-mail-ui-'));
  const port = await new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const chosen = socket.address().port;
      socket.close(() => resolvePort(chosen));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, VAGAS_DB_PATH: join(folder, 'test.sqlite'), VAGAS_PORT: String(port) }
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk.toString(); });
  server.stderr.on('data', chunk => { logs += chunk.toString(); });

  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(base);
        if (response.ok) { ready = true; break; }
      } catch {}
      if (server.exitCode !== null) throw Error(`Servidor encerrou: ${logs}`);
      await delay(60);
    }
    assert.ok(ready, `Servidor indisponível: ${logs}`);

    browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        browserErrors.push(message.text());
      }
    });
    page.on('dialog', dialog => dialog.accept());

    const disconnectedStatus = error => ({
      configured: true,
      credentialsReady: false,
      authorized: false,
      connected: false,
      connecting: false,
      error: error || '',
      expectedEmail: 'teste@example.com',
      pending: 0,
      unread: 0,
      alerts: { pending: 0, uncertain: 0, failed: 0 },
      linked: []
    });
    const connectedStatus = {
      ...disconnectedStatus(),
      credentialsReady: true,
      authorized: true,
      connected: true,
      email: 'teste@example.com'
    };
    let mailStatus = disconnectedStatus();
    let connectMode = 'fail';
    let syncCalls = 0;
    let cancelCalls = 0;
    let configureCalls = 0;
    let releaseDelayedConnect;
    let signalDelayedConnect;
    const delayedConnectStarted = new Promise(resolveStarted => { signalDelayedConnect = resolveStarted; });

    await page.route('**/api/mail/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const fulfill = (status, body) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body)
      });

      if (pathname === '/api/mail/status') return fulfill(200, mailStatus);
      if (pathname === '/api/mail/configure') {
        const credentials = route.request().postDataJSON();
        assert.equal(credentials.clientId, undefined, 'Client ID existente deve ser preservado ao salvar somente o segredo');
        assert.equal(credentials.clientSecret, 'fake-oauth-client-secret', 'Formulário deve enviar o Client Secret');
        configureCalls++;
        mailStatus = { ...mailStatus, credentialsReady: true };
        return fulfill(200, { status: mailStatus });
      }
      if (pathname === '/api/mail/connect/cancel') {
        cancelCalls++;
        mailStatus = { ...disconnectedStatus('Autorização cancelada. Você pode tentar novamente.'), credentialsReady: true };
        return fulfill(200, { status: mailStatus });
      }
      if (pathname === '/api/mail/connect') {
        if (connectMode === 'fail') {
          return fulfill(400, { error: 'Google OAuth simulado falhou ao validar o Client ID.' });
        }
        if (connectMode === 'late') {
          await new Promise(resolveLate => {
            releaseDelayedConnect = async () => {
              await fulfill(200, { status: connectedStatus });
              resolveLate();
            };
            signalDelayedConnect();
          });
          return;
        }
        mailStatus = connectedStatus;
        return fulfill(200, { status: mailStatus });
      }
      if (pathname === '/api/mail/sync') {
        syncCalls++;
        return fulfill(200, { status: mailStatus });
      }
      if (pathname === '/api/mail/inbox') return fulfill(200, { threads: [] });
      if (pathname === '/api/mail/disconnect') {
        mailStatus = { ...disconnectedStatus(), credentialsReady: true };
        return fulfill(200, { status: mailStatus });
      }
      return route.continue();
    });

    await page.goto(base);
    await page.locator('.dashboard-intro').waitFor();
    await page.locator('a[data-view="correio"]').first().click();
    await page.locator('.mail-setup').waitFor();

    const desktopMailLayout = await page.locator('.mail-summary').evaluate(element => {
      const summary = getComputedStyle(element);
      const firstMetric = getComputedStyle(element.firstElementChild);
      const setup = getComputedStyle(document.querySelector('.mail-setup'));
      return {
        display: summary.display,
        columns: summary.gridTemplateColumns,
        metricDisplay: firstMetric.display,
        metricPadding: firstMetric.paddingTop,
        setupPadding: setup.paddingTop
      };
    });
    assert.equal(desktopMailLayout.display, 'grid', 'Resumo do Correio deve usar grade no desktop');
    assert.ok(desktopMailLayout.columns.split(' ').length >= 3,
      'Resumo do Correio deve separar os três indicadores no desktop');
    assert.equal(desktopMailLayout.metricDisplay, 'grid', 'Cada indicador deve organizar seus textos em linhas');
    assert.ok(parseFloat(desktopMailLayout.metricPadding) >= 14, 'Indicadores devem ter espaçamento interno');
    assert.ok(parseFloat(desktopMailLayout.setupPadding) >= 20, 'Cartão OAuth deve ter espaçamento interno');
    assert.equal(await page.locator('input[name="clientSecret"]').getAttribute('type'), 'password',
      'Client Secret deve ser inserido em campo protegido');
    await page.locator('input[name="clientSecret"]').fill('fake-oauth-client-secret');
    await page.locator('form[data-form="mail-configure"] button[type="submit"]').click();
    await page.locator('[data-action="mail-connect"]').waitFor();
    assert.equal(configureCalls, 1, 'Salvar Client Secret deve atualizar a configuração');
    assert.equal(await page.locator('.mail-connect-actions').evaluate(element => getComputedStyle(element).display), 'flex',
      'Ações OAuth devem ficar alinhadas em linha');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMailColumns = await page.locator('.mail-summary').evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(mobileMailColumns, 1, 'Resumo do Correio deve ocupar uma coluna em telas estreitas');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.locator('[data-action="mail-connect"]').click();
    await page.locator('.mail-alert[role="alert"]').filter({
      hasText: 'Google OAuth simulado falhou'
    }).waitFor();
    assert.equal(await page.locator('[data-action="mail-connect"]').isEnabled(), true,
      'Falha OAuth deve liberar uma nova tentativa');
    assert.equal(await page.locator('[data-action="mail-connect-cancel"]').count(), 0,
      'Falha OAuth deve remover a ação de cancelamento');

    connectMode = 'success';
    await page.locator('[data-action="mail-connect"]').click();
    await page.locator('.mail-connected-bar').waitFor();
    assert.equal(syncCalls, 1, 'Conexão bem-sucedida deve iniciar a sincronização');

    await page.locator('[data-action="mail-disconnect"]').click();
    await page.locator('.mail-setup').waitFor();

    connectMode = 'late';
    await page.locator('[data-action="mail-connect"]').click();
    await page.locator('[data-action="mail-connect-cancel"]').waitFor();
    assert.equal(await page.locator('[data-action="mail-connect"]').isEnabled(), false,
      'Botão Conectar deve ficar bloqueado durante OAuth');
    await delayedConnectStarted;
    await page.locator('[data-action="mail-connect-cancel"]').click();
    await page.locator('.mail-alert[role="alert"]').filter({ hasText: 'Autorização cancelada' }).waitFor();
    assert.equal(cancelCalls, 1, 'Cancelar deve chamar o endpoint de cancelamento');
    assert.equal(await page.locator('[data-action="mail-connect"]').isEnabled(), true,
      'Cancelamento deve liberar a interface para tentar novamente');

    const syncCallsBeforeLateResponse = syncCalls;
    await releaseDelayedConnect();
    await delay(100);
    assert.equal(await page.locator('.mail-setup').isVisible(), true,
      'Resposta atrasada da tentativa cancelada não pode conectar a conta');
    assert.equal(await page.locator('.mail-connected-bar').count(), 0);
    assert.equal(syncCalls, syncCallsBeforeLateResponse,
      'Resposta atrasada não pode iniciar sincronização');

    connectMode = 'success';
    await page.locator('[data-action="mail-connect"]').click();
    await page.locator('.mail-connected-bar').waitFor();
    assert.equal(syncCalls, 2, 'Nova tentativa após cancelamento deve concluir normalmente');
    assert.deepEqual(browserErrors, [], 'A interface não deve lançar erros JavaScript');

    await context.close();
    console.log('PASSOU: falha OAuth, retry, sucesso, cancelamento, endpoint e resposta atrasada sem interferência.');
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      server.kill();
      await Promise.race([new Promise(resolveExit => server.once('exit', resolveExit)), delay(3000)]);
    }
    rmSync(folder, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
