// Teste interativo opcional: `npm run test:ui`. Usa Edge instalado e Playwright já disponível no cache do npx.
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
  throw Error('Playwright não encontrado. Instale no cache com `npx playwright --version`.');
}
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const { chromium } = findPlaywright();
  assert.ok(existsSync(edge), 'Microsoft Edge não encontrado no caminho padrão');
  const dir = mkdtempSync(join(tmpdir(), 'wnd-central-ui-'));
  const port = await new Promise((resolvePort, reject) => {
    const sock = createServer(); sock.once('error', reject);
    sock.listen(0, '127.0.0.1', () => { const p = sock.address().port; sock.close(() => resolvePort(p)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, VAGAS_DB_PATH: join(dir, 'test.sqlite'), VAGAS_PORT: String(port) }
  });
  let logs = '';
  server.stdout.on('data', c => logs += c.toString());
  server.stderr.on('data', c => logs += c.toString());
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      try { const response = await fetch(base); if (response.ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) throw Error('Servidor finalizou: ' + logs);
      await delay(150);
    }
    assert.ok(ready, 'Servidor indisponível: ' + logs);
    browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run'] });
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await desktop.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(base);
    await page.locator('.dashboard-intro').waitFor();
    await page.locator('a[data-view="settings"]').first().click();
    await page.locator('[data-action="set-theme"][data-theme="midnight"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'midnight');
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim()), '#8fd6ff');
    await page.reload();
    await page.locator('[data-action="set-theme"][data-theme="midnight"]').waitFor();
    assert.equal(await page.locator('[data-theme="midnight"]').count() > 0, true);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'midnight', 'Tema deve persistir após reiniciar a página');
    await page.locator('[data-action="set-theme"][data-theme="light"]').click();
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--bg').trim()), '#f4f5f0');
    await page.locator('[data-action="set-theme"][data-theme="graphite"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'graphite');
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim()), '#d4d9e0');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'graphite', 'Tema Grafite deve persistir após recarregar');
    await page.locator('[data-action="set-theme"][data-theme="original"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'original');
    await page.locator('a[data-view="overview"]').first().click();
    await page.locator('.dashboard-intro').waitFor();
    assert.equal(await page.locator('.review-panel [data-action="add-job"]').count(), 1,
      'Uma instalação vazia deve permitir adicionar vaga pelo painel inicial');

    // Uma instalação vazia permite cadastrar uma vaga, rejeitar e excluir sem importador externo.
    await page.locator('a[data-view="vagas"]').first().click();
    assert.equal(await page.locator('[data-action="search-new-jobs"]').count(), 1,
      'A página de vagas deve exibir o botão de busca manual');
    const searchStyle = await page.locator('#job-search').evaluate(input => {
      input.focus();
      const css=getComputedStyle(input);
      return {border:css.borderTopWidth,background:css.backgroundColor,radius:css.borderTopLeftRadius};
    });
    assert.equal(searchStyle.border,'0px','Busca de vagas deve ter apenas uma borda externa');
    assert.equal(searchStyle.background,'rgba(0, 0, 0, 0)','O input de busca não deve desenhar um segundo retângulo');
    assert.equal(searchStyle.radius,'0px');
    await page.getByText('Nenhuma vaga encontrada').waitFor();
    await page.locator('.job-table [data-action="add-job"]').click();
    const jobForm=page.locator('form[data-form="job"]');
    await jobForm.locator('input[name="title"]').fill('Designer de interfaces');
    await jobForm.locator('input[name="company"]').fill('Estúdio Teste');
    await jobForm.locator('input[name="source_url"]').fill('https://example.org/jobs/ui-test');
    await jobForm.locator('input[name="location"]').fill('Remoto');
    await jobForm.locator('button[type="submit"]').click();
    await page.locator('.job-table > .job-list-item').filter({hasText:'Designer de interfaces'}).waitFor();
    assert.equal(await page.locator('.job-table > .job-list-item').count(),1);
    assert.match(await page.locator('.job-table .job-added').innerText(), /Adicionada em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/);
    await page.locator('.job-table [data-action="reject-job"]').click();
    await page.locator('.kito-confirm [data-confirm="accept"]').click();
    await page.locator('.job-table > .job-list-item .status-rejected').waitFor();
    await page.locator('.job-table [data-action="delete-job"]').click();
    await page.locator('.kito-confirm [data-confirm="accept"]').click();
    await page.getByText('Nenhuma vaga encontrada').waitFor();
    await page.reload();
    await page.locator('main[data-view="vagas"]').waitFor();
    assert.equal(await page.locator('.job-table > .job-list-item').count(),0);
    await page.locator('a[data-view="overview"]').first().click();

    // Dados bancários antigos devem iniciar sincronização ao abrir, com erro visível e retry manual.
    const autoPage = await desktop.newPage();
    autoPage.on('pageerror', error => errors.push(error.message));
    let syncCalls = 0;
    const autoBank = {
      configured: true,
      items: [{ id: 'auto-item', institution: 'Banco simulado', last_synced_at: '2026-11-16T12:00:00.000Z' }],
      accounts: [], transactions: [],
      insights: { month: '2026-11', incomeCents: 14000, expenseCents: 4000, netCents: 10000,
        importedThisMonth: 2, estimatedDueCents: 0, categories: [], recurring: [] }
    };
    await autoPage.route('**/api/banking**', route => {
      if (new URL(route.request().url()).pathname === '/api/banking/sync') {
        syncCalls++;
        if (syncCalls === 1 || syncCalls === 3) return route.fulfill({ status: 502, contentType: 'application/json',
          body: JSON.stringify({ error: 'Falha temporária simulada.' }) });
        autoBank.items[0].last_synced_at = new Date().toISOString();
        autoBank.insights.netCents = 14300;
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ synced: 1, failures: [] }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(autoBank) });
    });
    await autoPage.goto(base);
    await autoPage.waitForFunction(() => state.bankSyncError === 'Falha temporária simulada.');
    assert.equal(syncCalls, 1, 'Abrir o dashboard deve sincronizar bancos com dados antigos');
    assert.match(await autoPage.locator('.finance-source').innerText(), /atualização falhou/);
    assert.match(await autoPage.locator('#footer-sync').innerText(), /Falha na sincronização bancária/);
    await autoPage.locator('#refresh').click();
    await autoPage.waitForFunction(() => state.bankSyncError === null && state.banking?.insights?.netCents === 14300);
    assert.equal(syncCalls, 2, 'Atualização manual deve tentar novamente');
    assert.match(await autoPage.locator('.finance-panel .finance-balance').innerText(), /143,00/);
    assert.doesNotMatch(await autoPage.locator('#footer-sync').innerText(), /Falha na sincronização bancária/);
    await autoPage.locator('#refresh').click();
    await autoPage.waitForFunction(() => state.bankSyncError === 'Falha temporária simulada.');
    assert.equal(syncCalls, 3, 'Atualização manual pode falhar mesmo com uma importação recente');
    await autoPage.evaluate(async () => {
      lastBankSyncAttemptAt = Date.now() - BANK_FAILURE_RETRY - 1000;
      await refreshVisibleData();
    });
    assert.equal(syncCalls, 4, 'Falha recente deve permitir retry automático após o intervalo, mesmo com dados locais recentes');
    await autoPage.waitForFunction(() => state.bankSyncError === null);
    await autoPage.close();

    // Busca global: atalho de teclado, filtro, navegação e devolução do foco.
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#command-backdrop').isVisible(),true);
    assert.equal(await page.locator('#command-search').getAttribute('aria-expanded'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'command-input');
    await page.locator('#command-input').fill('finan');
    assert.equal(await page.locator('.command-option').count(),1);
    await page.locator('#command-input').press('Enter');
    await page.locator('main[data-view="finance"]').waitFor();
    assert.equal(await page.locator('#command-backdrop').isVisible(),false);
    const focusBeforeQuickAction = await page.evaluate(()=>document.activeElement?.id);
    await page.keyboard.press('Control+k');
    await page.locator('#command-input').fill('nova tarefa');
    assert.equal(await page.locator('.command-option').count(),1);
    await page.locator('#command-input').press('Enter');
    await page.locator('#dialog-body form[data-form="task"]').waitFor();
    assert.equal(await page.locator('#command-backdrop').isVisible(),false);
    await page.locator('[data-action="close-dialog"]').last().click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),focusBeforeQuickAction);
    // Compras no cartão têm sinal oposto às movimentações de conta bancária.
    const mockBanking = {
      configured:true,
      balanceCents:5000,
      items:[{id:'mock-item',institution:'Instituição teste',last_synced_at:'2026-11-17T12:00:00.000Z'}],
      accounts:[{id:'mock-card',name:'Cartão teste',currency:'BRL',type:'CREDIT',balance_cents:1200}],
      insights:{month:'2026-11',incomeCents:20000,expenseCents:7500,netCents:12500,estimatedDueCents:3990,importedThisMonth:3,categories:[{name:'Alimentação',amountCents:7500}],recurring:[{merchant:'Netflix',category:'Entretenimento',accountName:'Cartão teste',occurrences:3,paidThisMonth:false,nextDue:'2026-11-23',estimatedCents:3990}]},
      bills:{bills:[{id:10,description:'Internet teste',category:'Moradia',due_on:'2026-11-25',amount_cents:9900,paid:false}],owedCents:9900,paidCents:0},
      transactions:[
        {id:'purchase',description:'Compra teste',institution:'Instituição teste',account_name:'Cartão teste',account_type:'CREDIT',amount_cents:5000,currency:'BRL',occurred_on:'2026-11-17'},
        {id:'payment',description:'Pagamento teste',institution:'Instituição teste',account_name:'Cartão teste',account_type:'CREDIT',amount_cents:-2000,currency:'BRL',occurred_on:'2026-11-17'},
        {id:'bank-debit',description:'Débito teste',institution:'Instituição teste',account_name:'Conta corrente',account_type:'BANK',category_label:'Alimentação',amount_cents:-750,currency:'BRL',occurred_on:'2026-11-17'}
      ]
    };
    await page.route('**/api/banking**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mockBanking)}));
    await page.evaluate(() => load());
    assert.equal(await page.locator('.bank-monthly-stat').count(), 4);
    assert.match(await page.locator('.bank-monthly-stat.owed strong').innerText(), /99,00/);
    assert.match(await page.locator('.bank-recurring-total').innerText(), /39,90/);
    assert.equal(await page.locator('.bank-category-row').count(), 1);
    assert.equal(await page.locator('.bank-fold[data-bank-section="connections"]').getAttribute('open'), null);
    await page.locator('.bank-fold[data-bank-section="connections"] summary').click();
    assert.notEqual(await page.locator('.bank-fold[data-bank-section="connections"]').getAttribute('open'), null);
    await page.locator('.bank-fold[data-bank-section="movements"] summary').click();
    assert.equal(await page.locator('.bank-fold[data-bank-section="movements"]').getAttribute('open'), null);
    await page.locator('.bank-fold[data-bank-section="movements"] summary').click();
    assert.notEqual(await page.locator('.bank-fold[data-bank-section="movements"]').getAttribute('open'), null);
    const bankMovements=page.locator('.bank-transaction .transaction-value');
    assert.deepEqual(await bankMovements.evaluateAll(nodes=>nodes.map(n=>({value:n.textContent.trim(),direction:n.classList.contains('expense')?'expense':'income'}))),[
      {value:'− R$ 50,00',direction:'expense'},
      {value:'+ R$ 20,00',direction:'income'},
      {value:'− R$ 7,50',direction:'expense'}
    ]);
    const searchInput=page.locator('#bank-search');
    await page.evaluate(()=>window.__bankSearch=document.querySelector('#bank-search'));
    await searchInput.pressSequentially('debito');
    assert.equal(await page.locator('.bank-transaction').count(),1);
    assert.match(await page.locator('.bank-transaction').innerText(),/Débito teste/);
    assert.deepEqual(await page.evaluate(()=>({same:document.querySelector('#bank-search')===window.__bankSearch,
      focused:document.activeElement===window.__bankSearch,cursor:window.__bankSearch.selectionStart})),
      {same:true,focused:true,cursor:6});
    await searchInput.fill('alimentacao');
    assert.equal(await page.locator('.bank-transaction').count(),1,'Pesquisa deve ignorar acentos');
    await searchInput.fill('7,50');
    assert.equal(await page.locator('.bank-transaction').count(),1,'Pesquisa deve aceitar valor em reais');
    await searchInput.fill('inexistente');
    assert.equal(await page.locator('.bank-transaction').count(),0);
    assert.match(await page.locator('.bank-no-results').innerText(),/Nenhuma movimentação/);
    await searchInput.fill('');
    await page.locator('[data-action="bank-direction"][data-direction="income"]').click();
    assert.equal(await page.locator('.bank-transaction').count(),1);
    assert.match(await page.locator('.bank-transaction').innerText(),/Pagamento teste/);
    assert.equal(await page.locator('#bank-result-count').innerText(),'1 de 3 movimentações');
    await page.locator('[data-action="bank-direction"][data-direction="all"]').click();
    await page.locator('a[data-view="overview"]').first().click();
    assert.match(await page.locator('.finance-panel .finance-balance').innerText(),/125,00/);
    assert.match(await page.locator('.amount-stat').innerText(),/125,00/);
    assert.match(await page.locator('.finance-source').innerText(),/Bancos/);
    mockBanking.insights.netCents=9000;
    mockBanking.insights.incomeCents=16500;
    await page.evaluate(()=>load());
    assert.match(await page.locator('.finance-panel .finance-balance').innerText(),/90,00/,'Visão geral deve refletir nova leitura dos bancos');
    await page.locator('a[data-view="finance"]').first().click();
    assert.equal(await page.locator('#bank-search').inputValue(),'');
    assert.equal(await page.locator('[data-action="bank-direction"][data-direction="all"]').getAttribute('aria-pressed'),'true');
    await page.unroute('**/api/banking**');
    await page.evaluate(() => load());
    await page.locator('#command-search').click();
    await page.locator('#command-input').fill('inexistente');
    await page.locator('.command-empty').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'command-search');
    await page.keyboard.press('Control+k');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('command-option')),true);
    await page.keyboard.press('Escape');
    await page.locator('a[data-view="overview"]').first().click();

    // O contador da topbar acompanha a mesma contagem das oportunidades.
    await page.route('**/api/opportunities',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],stats:[{status:'pending_review',count:2}]})}));
    await page.evaluate(()=>load());
    assert.equal(await page.locator('#nav-pending').innerText(),'2');
    assert.equal(await page.locator('#topbar-pending').innerText(),'2');
    await page.unroute('**/api/opportunities');
    await page.evaluate(()=>load());
    assert.equal(await page.locator('#topbar-pending').isHidden(),true);

    // Atualizações de métricas alteram somente valores e medidores, preservando DOM e foco.
    const pcSample = {cpu_percent:37,memory_percent:50,memory_used:12*1024**3,memory_total:24*1024**3,uptime:3660,updated_at:'2026-11-17T12:00:00.000Z'};
    await page.route('**/api/pc',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(pcSample)}));
    const overviewLive=await page.evaluate(async()=>{
      const original=document.querySelector('#main-content').firstElementChild;
      const button=document.querySelector('[data-action="add-task"]');
      button.focus();
      await refreshPCMetrics();
      return {
        sameRoot:document.querySelector('#main-content').firstElementChild===original,
        focusPreserved:document.activeElement===button,
        cpu:document.querySelector('[data-pc-value="mini-cpu"]').textContent,
        memory:document.querySelector('[data-pc-value="overview-memory"]').textContent,
        cpuMeter:document.querySelector('[data-pc-meter="mini-cpu"]').value,
        memoryMeter:document.querySelector('[data-pc-meter="mini-memory"]').value
      };
    });
    assert.deepEqual(overviewLive,{sameRoot:true,focusPreserved:true,cpu:'37%',memory:'50%',cpuMeter:37,memoryMeter:50});
    await page.locator('a[data-view="pc"]').first().click();
    const pcLive=await page.evaluate(async()=>{
      const original=document.querySelector('.pc-stats');
      state.pc={...state.pc,cpu_percent:1,memory_percent:2};
      await refreshPCMetrics();
      return {
        sameRoot:document.querySelector('.pc-stats')===original,
        cpu:document.querySelector('[data-pc-value="detail-cpu"]').textContent,
        memory:document.querySelector('[data-pc-value="detail-memory"]').textContent,
        uptime:document.querySelector('[data-pc-value="detail-uptime"]').textContent,
        used:document.querySelector('[data-pc-value="detail-ram-usage"]').textContent,
        meter:document.querySelector('[data-pc-meter="detail-cpu"]').value,
        updated:document.querySelector('[data-pc-value="detail-updated"]').textContent
      };
    });
    assert.equal(pcLive.sameRoot,true);
    assert.equal(pcLive.cpu,'37%');
    assert.equal(pcLive.memory,'50%');
    assert.equal(pcLive.uptime,'1h 1min');
    assert.equal(pcLive.used,'12 GB de 24 GB');
    assert.equal(pcLive.meter,37);
    assert.ok(pcLive.updated.includes('17 de nov'),pcLive.updated);
    await page.unroute('**/api/pc');
    await page.locator('a[data-view="overview"]').first().click();

    // Pesquisa reativa: manter o campo montado, o foco e o cursor ao filtrar.
    await page.evaluate(() => {
      state.jobs = [
        { id:'aaaaaaaaaaaaaaaaaaaa',company:'Studio Alpha',title:'Motion Designer',source:'LinkedIn',status:'pending_review' },
        { id:'bbbbbbbbbbbbbbbbbbbb',company:'Beta Agency',title:'Editor de Vídeo',source:'99Freelas',status:'approved' },
        { id:'cccccccccccccccccccc',company:'Gamma Studio',title:'Estagiário de Design Gráfico',source:'Site oficial',requirements:'Photoshop e Illustrator',status:'pending_review',match_score:86 }
      ];
      state.counts.pending_review = 2;
    });
    await page.locator('a[data-view="vagas"]').first().click();
    assert.equal(await page.locator('.job-table > .job-list-item').count(), 3);
    assert.match(await page.locator('.job-table').innerText(), /86\/100 aderência/);
    await page.evaluate(() => { window.__originalSearchField = document.querySelector('#job-search'); });
    await page.locator('#job-search').pressSequentially('Beta');
    assert.equal(await page.locator('.job-table > .job-list-item').count(), 1);
    assert.match(await page.locator('.job-table > .job-list-item').innerText(), /Beta Agency/);
    assert.equal(await page.locator('.count-note').innerText(), '1 oportunidade');
    assert.deepEqual(await page.evaluate(() => ({
      sameField:document.querySelector('#job-search') === window.__originalSearchField,
      focused:document.activeElement === window.__originalSearchField,
      cursor:window.__originalSearchField.selectionStart,
      value:window.__originalSearchField.value
    })), { sameField:true, focused:true, cursor:4, value:'Beta' });
    await page.locator('#job-search').fill('não existe');
    assert.equal(await page.locator('.job-table > .job-list-item').count(), 0);
    await page.getByText('Nenhuma vaga encontrada').waitFor();
    await page.locator('#job-search').fill('');
    await page.locator('[data-action="job-filter"][data-filter="approved"]').click();
    assert.equal(await page.locator('.job-table > .job-list-item').count(), 1);
    assert.equal(await page.locator('[data-filter="approved"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-action="job-filter"][data-filter="internship"]').click();
    assert.equal(await page.locator('.job-table > .job-list-item').count(), 1);
    assert.match(await page.locator('.job-table > .job-list-item').innerText(), /Estagiário de Design Gráfico/);
    await page.locator('[data-action="job-filter"][data-filter="all"]').click();
    await page.locator('#job-search').fill('Illustrator');
    assert.equal(await page.locator('.job-table > .job-list-item').count(), 1, 'Busca deve considerar requisitos da vaga');
    await page.locator('a[data-view="overview"]').first().click();
    await page.reload();
    await page.locator('.dashboard-intro').waitFor();

    // Espaço e seus três blocos: nota, checklist e link.
    await page.locator('a[data-view="spaces"]').first().click();
    await page.locator('[data-action="add-space"]').first().click();
    await page.locator('form[data-form="space"] input[name="title"]').fill('Meus projetos');
    await page.locator('form[data-form="space"] textarea[name="description"]').fill('Referências e ideias');
    await page.locator('form[data-form="space"] button[type="submit"]').click();
    await page.locator('.space-back').waitFor();
    assert.match(await page.locator('.page-heading h1').innerText(), /Meus projetos/);
    const spaceId = Number(new URL(page.url()).hash.replace('#space-', ''));
    assert.ok(spaceId > 0);
    await page.keyboard.press('Control+k');
    await page.locator('#command-input').fill('PROJETOS');
    assert.equal(await page.locator('.command-option').count(),1);
    await page.locator(`.command-option[data-command-view="space-${spaceId}"]`).click();
    assert.match(await page.locator('.page-heading h1').innerText(), /Meus projetos/);

    async function addBlock(kind, title, content, url) {
      await page.locator('[data-action="add-space-item"]').first().click();
      await page.locator('form[data-form="space-item"] select[name="kind"]').selectOption(kind);
      await page.locator('form[data-form="space-item"] input[name="title"]').fill(title);
      await page.locator('form[data-form="space-item"] textarea[name="content"]').fill(content);
      if (url) await page.locator('form[data-form="space-item"] input[name="url"]').fill(url);
      await page.locator('form[data-form="space-item"] button[type="submit"]').click();
      await page.locator('.space-block').filter({ hasText: title }).waitFor();
    }
    await addBlock('note', 'Referências', 'Estudar animação de produto');
    await addBlock('check', 'Revisar portfólio', 'Verificar versão mobile');
    await addBlock('link', 'Meu site', 'Referência de identidade', 'https://wnd.net.br');
    assert.equal(await page.locator('.space-block').count(), 3);
    await page.locator('.space-block').filter({hasText:'Revisar portfólio'}).locator('input[type=checkbox]').check();
    await page.locator('.space-block.completed').filter({hasText:'Revisar portfólio'}).waitFor();
    await page.locator('[data-action="edit-space"]').click();
    await page.locator('form[data-form="space-edit"] textarea[name="description"]').fill('Projetos, referências e checklist');
    await page.locator('form[data-form="space-edit"] button[type=submit]').click();
    await page.locator('.page-heading').getByText('Projetos, referências e checklist').waitFor();
    await page.locator('.space-block').filter({hasText:'Referências'}).locator('[data-action="delete-space-item"]').click();
    await page.locator('.kito-confirm [data-confirm="accept"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.space-block').length === 2);
    assert.equal(await page.locator('.space-block').count(), 2);

    // Tarefas, rotina, lançamentos e atalhos: operações reais contra um banco isolado.
    await page.locator('a[data-view="tasks"]').first().click();
    await page.locator('[data-action="add-task"]').first().click();
    await page.locator('form[data-form="task"] input[name="title"]').fill('Finalizar motion');
    await page.locator('form[data-form="task"] button[type=submit]').click();
    await page.getByText('Finalizar motion').waitFor();
    await page.locator('a[data-view="routine"]').first().click();
    await page.locator('[data-action="add-routine"]').first().click();
    await page.locator('form[data-form="routine"] input[name="title"]').fill('Caminhar');
    await page.locator('form[data-form="routine"] button[type=submit]').click();
    await page.getByText('Caminhar').waitFor();
    await page.locator('a[data-view="finance"]').first().click();
    await page.locator('[data-action="add-finance"]').first().click();
    await page.locator('form[data-form="finance"] input[name="description"]').fill('Assinatura software');
    await page.locator('form[data-form="finance"] input[name="amount"]').fill('49,90');
    await page.locator('form[data-form="finance"] button[type=submit]').click();
    await page.getByText('Assinatura software').waitFor();
    await page.locator('a[data-view="shortcuts"]').first().click();
    await page.locator('[data-action="add-shortcut"]').first().click();
    await page.locator('form[data-form="shortcut"] input[name="label"]').fill('Meu portfólio');
    await page.locator('form[data-form="shortcut"] input[name="url"]').fill('https://wnd.net.br');
    await page.locator('form[data-form="shortcut"] button[type=submit]').click();
    await page.getByText('Meu portfólio').waitFor();

    // Editor de layout: mudar coluna, ordem, persistir após reload e restaurar.
    await page.locator('a[data-view="settings"]').first().click();
    await page.locator('[data-layout-card="routine"] [data-move="switch"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.layout-column:first-child .layout-item')].some(e => e.dataset.layoutCard === 'routine'));
    await page.locator('[data-layout-card="routine"] [data-move="up"]').click();
    await page.waitForFunction(() => document.querySelector('.layout-column:first-child .layout-item:nth-child(2)')?.dataset.layoutCard === 'routine');
    await page.locator('a[data-view="overview"]').first().click();
    assert.deepEqual(await page.locator('.dashboard-main > section').evaluateAll(es => es.map(e => e.classList[1])),['review-panel','routine-panel','tasks-panel']);
    await page.reload();
    await page.locator('.dashboard-intro').waitFor();
    assert.deepEqual(await page.locator('.dashboard-main > section').evaluateAll(es => es.map(e => e.classList[1])),['review-panel','routine-panel','tasks-panel']);
    await page.locator('a[data-view="settings"]').first().click();
    await page.screenshot({path:join(root,'dashboard-settings.png'),fullPage:true,animations:'disabled'});
    await page.locator('[data-action="reset-overview-layout"]').click();
    await page.waitForFunction(() => document.querySelector('.layout-column:first-child .layout-item:last-child')?.dataset.layoutCard === 'tasks');
    await page.locator('a[data-view="overview"]').first().click();
    assert.deepEqual(await page.locator('.dashboard-aside > section').evaluateAll(es => es.map(e => e.classList[1])),['routine-panel','finance-panel','pc-panel']);
    await page.screenshot({path:join(root,'dashboard-desktop.png'),fullPage:true,animations:'disabled'});
    const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(desktopOverflow,false,'Dashboard transborda horizontalmente em desktop');
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch:true });
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', e => errors.push('mobile: '+e.message));
    await mobilePage.goto(base);
    await mobilePage.locator('.dashboard-intro').waitFor();
    const responsive = await mobilePage.evaluate(() => {
      const stats = document.querySelector('.overview-stats');
      const metrics = document.querySelector('.pc-mini');
      const cpu = metrics.children[0].getBoundingClientRect();
      const cpuMeter = metrics.children[1].getBoundingClientRect();
      const memory = metrics.children[2].getBoundingClientRect();
      return {
        statsDisplay: getComputedStyle(stats).display,
        statsColumns: getComputedStyle(stats).gridTemplateColumns.split(' ').length,
        cpuMeterBelowLabel: cpuMeter.top >= cpu.bottom,
        memoryBelowCpuMeter: memory.top >= cpuMeter.bottom
      };
    });
    assert.equal(responsive.statsDisplay, 'grid', 'Resumo mobile precisa usar grade');
    assert.equal(responsive.statsColumns, 2, 'Resumo mobile precisa ter duas colunas');
    assert.ok(responsive.cpuMeterBelowLabel && responsive.memoryBelowCpuMeter,
      'Medidores do PC não podem sobrepor seus rótulos');
    await mobilePage.screenshot({path:join(root,'dashboard-mobile.png'),fullPage:true,animations:'disabled'});
    const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(mobileOverflow,false,'Dashboard transborda horizontalmente em mobile');
    await mobilePage.locator('#command-search').click();
    await mobilePage.locator('#command-input').fill('tarefas');
    await mobilePage.locator('#command-input').press('Enter');
    await mobilePage.locator('main[data-view="tasks"]').waitFor();
    await mobilePage.locator('#command-search').click();
    await mobilePage.locator('#command-input').fill('hoje');
    await mobilePage.locator('#command-input').press('Enter');
    await mobilePage.locator('main[data-view="overview"]').waitFor();
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-label'),'Abrir menu');
    assert.equal(await mobilePage.locator('#sidebar-navigation').evaluate(el=>el.inert),true);
    await mobilePage.locator('#mobile-menu').click();
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-expanded'),'true');
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-label'),'Fechar menu');
    assert.equal(await mobilePage.locator('#sidebar-navigation').evaluate(el=>el.inert),false);
    assert.equal(await mobilePage.evaluate(()=>document.activeElement?.classList.contains('active')),true,'Menu deve focar a seção atual');
    await mobilePage.keyboard.press('Escape');
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
    assert.equal(await mobilePage.evaluate(()=>document.activeElement?.id),'mobile-menu','Escape restaura o foco');
    await mobilePage.locator('#mobile-menu').click();
    await mobilePage.locator('#mobile-shade').click({position:{x:340,y:430}});
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-expanded'),'false','Backdrop deve fechar o menu');
    assert.equal(await mobilePage.evaluate(()=>document.activeElement?.id),'mobile-menu','Backdrop restaura o foco');
    await mobilePage.locator('#mobile-menu').click();
    await mobilePage.locator('a[data-view="spaces"]').first().click();
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-expanded'),'false','Navegar deve fechar o menu');
    assert.equal(await mobilePage.evaluate(()=>document.activeElement?.id),'main-content','Navegar deve focar o conteúdo');
    await mobilePage.locator('.space-card').filter({hasText:'Meus projetos'}).click();
    await mobilePage.locator('.space-block').filter({hasText:'Meu site'}).waitFor();
    assert.equal(await mobilePage.locator('.space-block').count(),2);
    const spaceOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(spaceOverflow,false,'Espaços transbordam horizontalmente em mobile');
    await mobilePage.locator('#mobile-menu').click();
    await mobilePage.locator('a[data-view="settings"]').first().click();
    await mobilePage.locator('.layout-editor').waitFor();
    const settingsOverflow=await mobilePage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    assert.equal(settingsOverflow,false,'Editor de layout transborda horizontalmente em mobile');
    await mobilePage.locator('#mobile-menu').click();
    await mobilePage.setViewportSize({width:900,height:844});
    await mobilePage.waitForFunction(() => document.querySelector('#mobile-menu')?.getAttribute('aria-expanded') === 'false', null, {timeout:3000});
    assert.equal(await mobilePage.locator('#mobile-menu').getAttribute('aria-expanded'),'false','Resize deve fechar menu');
    assert.equal(await mobilePage.locator('#sidebar-navigation').evaluate(el=>el.inert),false,'Sidebar desktop navegável');
    for(const width of [320,480,740,820,1024]){
      await mobilePage.setViewportSize({width,height:844});
      const overflow=await mobilePage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      assert.equal(overflow,false,`Overflow horizontal em ${width}px`);
    }
    assert.deepEqual(errors, [], 'Erros de console/browser');
    await mobile.close();
    await desktop.close();
    console.log('PASSOU: desktop/mobile, sem overflow ou erros JS; CRUD e personalização de cards com persistência e reset.');
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) { server.kill(); await Promise.race([new Promise(r => server.once('exit', r)), delay(3000)]); }
    rmSync(dir, {force:true, recursive:true});
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
