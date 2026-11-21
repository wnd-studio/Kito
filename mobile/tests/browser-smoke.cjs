const {spawn} = require('node:child_process');
const {createServer} = require('node:net');
const {existsSync, readdirSync, mkdirSync} = require('node:fs');
const {join, resolve} = require('node:path');
const {homedir} = require('node:os');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
function playwright() {
  try { return require('playwright'); } catch {}
  const cache = join(process.env.LOCALAPPDATA || join(homedir(),'AppData','Local'),'npm-cache','_npx');
  for (const dir of existsSync(cache) ? readdirSync(cache) : []) {
    const path = join(cache,dir,'node_modules','playwright');
    if (existsSync(path)) return require(path);
  }
  throw Error('Playwright ausente. Execute npx playwright --version.');
}
async function port() {
  return new Promise((resolvePort,reject) => {
    const server = createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',() => {
      const selected = server.address().port;
      server.close(() => resolvePort(selected));
    });
  });
}
async function main() {
  const {chromium} = playwright();
  const selected = await port();
  const url = `http://127.0.0.1:${selected}`;
  const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(selected),'--strictPort'],{cwd:root,windowsHide:true});
  let output = '';
  server.stdout.on('data',message => output += message.toString());
  server.stderr.on('data',message => output += message.toString());
  let browser;
  try {
    let ready = false;
    for (let retry = 0; retry < 100; retry++) {
      try {if ((await fetch(url)).ok) {ready = true; break;}} catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolveWait => setTimeout(resolveWait,150));
    }
    assert.ok(ready,`Vite não iniciou. ${output}`);
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    browser = await chromium.launch({headless:true,...(existsSync(edge) ? {executablePath:edge} : {})});
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('heading',{name:/Seu dia/}).waitFor();
    const logo = page.locator('.app-header .brand-mark img');
    await logo.waitFor({state:'visible'});
    assert.equal(await logo.getAttribute('src'),'/kito-mark.png','Logo do cabeçalho deve usar a marca oficial');
    assert.ok(await logo.evaluate(img => img.complete && img.naturalWidth > 0),'Logo do Kito deve carregar');
    await page.locator('[data-nav="tasks"]').last().click();
    await page.locator('[data-add="tasks"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Enviar portfólio');
    await page.locator('#editor-form [type="submit"]').click();
    await page.getByText('Enviar portfólio').waitFor();
    await page.locator('[data-toggle="tasks"]').first().click();
    await page.reload();
    await page.locator('[data-nav="tasks"]').last().click();
    assert.equal(await page.locator('.list-row.is-done').count(),1,'Tarefa concluída deve persistir');

    await page.locator('[data-nav="routine"]').last().click();
    await page.locator('[data-add="routines"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Estudar inglês');
    await page.locator('#editor-form [type="submit"]').click();
    await page.locator('[data-toggle="routines"]').first().click();
    assert.equal(await page.locator('.list-row.is-done').count(),1);

    await page.locator('[data-nav="finance"]').last().click();
    await page.locator('[data-add="transactions"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Freelance');
    await page.locator('#editor-fields [name="amount"]').fill('1.230,50');
    await page.locator('#editor-fields [name="type"]').selectOption('income');
    await page.locator('#editor-form [type="submit"]').click();
    await page.getByText('Freelance').waitFor();
    assert.ok(await page.getByText('R$ 1.230,50').count() > 0);
    await page.locator('[data-add="bills"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Internet');
    await page.locator('#editor-fields [name="amount"]').fill('99,90');
    await page.locator('#editor-fields [name="repeat"]').check();
    await page.locator('#editor-form [type="submit"]').click();
    await page.locator('[data-toggle="bills"]').first().click();
    assert.equal(await page.locator('.list-row.is-done').count(),1);

    await page.locator('[data-nav="more"]').last().click();
    await page.locator('[data-nav="jobs"]').click();
    await page.locator('[data-add="jobs"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Designer');
    await page.locator('#editor-fields [name="company"]').fill('Acme');
    await page.locator('#editor-form [type="submit"]').click();
    await page.getByText('Acme').waitFor();
    await page.locator('[data-nav="more"]').last().click();
    await page.locator('[data-nav="spaces"]').click();
    await page.locator('[data-add="spaces"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Projeto');
    await page.locator('#editor-fields [name="note"]').fill('Anotações pessoais');
    await page.locator('#editor-fields [name="items"]').fill('Planejar\nExecutar');
    await page.locator('#editor-form [type="submit"]').click();
    await page.locator('[data-space-check]').first().check();
    await page.reload();
    await page.locator('[data-nav="more"]').last().click();
    await page.locator('[data-nav="spaces"]').click();
    assert.ok(await page.locator('[data-space-check]').first().isChecked());

    await page.locator('[data-nav="more"]').last().click();
    await page.locator('[data-nav="shortcuts"]').click();
    await page.locator('[data-add="shortcuts"]').click();
    await page.locator('#editor-fields [name="title"]').fill('Portfólio');
    await page.locator('#editor-fields [name="url"]').fill('https://wnd.net.br');
    await page.locator('#editor-form [type="submit"]').click();
    await page.getByText('Portfólio').waitFor();

    await page.locator('.avatar').click();
    await page.locator('[data-theme="midnight"]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'midnight');
    await page.locator('.avatar').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(),/kito-backup-\d{4}-\d{2}-\d{2}\.json/);

    const width = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,inner:window.innerWidth}));
    assert.ok(width.scroll <= width.inner + 1,`Overflow mobile ${JSON.stringify(width)}`);
    mkdirSync(join(root,'test-output'),{recursive:true});
    await page.screenshot({path:join(root,'test-output','kito-mobile-390.png'),fullPage:true});
    await page.setViewportSize({width:320,height:700});
    await page.locator('[data-nav="finance"]').last().click();
    const narrow = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,inner:window.innerWidth}));
    assert.ok(narrow.scroll <= narrow.inner + 1,`Overflow 320px ${JSON.stringify(narrow)}`);
    await page.screenshot({path:join(root,'test-output','kito-mobile-320.png'),fullPage:true});
    assert.deepEqual(errors,[],'Erros JavaScript');
    console.log('Mobile UI validada: CRUD, persistência, rotinas, finanças, vagas, espaços, atalhos, tema, backup e 320/390 px.');
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
