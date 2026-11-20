import './style.css';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { initialData, normalizeData, today, month, money, parseCents, safeUrl, billForMonth, totals, newEntry } from './model.js';

const storageKey = 'kito.mobile.data.v1';
const native = Capacitor.isNativePlatform();
const main = document.querySelector('#main');
const tabs = document.querySelector('#tabs');
const editor = document.querySelector('#editor');
const form = document.querySelector('#editor-form');
const confirmDialog = document.querySelector('#confirm-dialog');
const toast = document.querySelector('#toast');
const navigation = [
  ['home', 'Hoje', 'home'], ['tasks', 'Tarefas', 'check'],
  ['routine', 'Rotina', 'calendar'], ['finance', 'Finanças', 'wallet'],
  ['more', 'Mais', 'grid']
];
const pages = {home:'Hoje', tasks:'Tarefas', routine:'Rotina', finance:'Finanças', more:'Mais',
  jobs:'Vagas', spaces:'Espaços', shortcuts:'Atalhos', settings:'Configurações'};
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  check:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 14h2"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  external:'<path d="M13 5h6v6M19 5l-9 9"/><path d="M19 14v5H5V5h5"/>',
  arrow:'<path d="m7 14 5-5 5 5"/>',
  file:'<path d="M7 3h8l5 5v13H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM14 3v6h6"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  book:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h6M9 12h6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'
};
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const empty = (title, detail) => `<div class="empty"><span class="empty-glyph">✳</span><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;
const buttonAdd = (type, label) => `<button class="button primary" data-add="${type}">${icon('plus', 17)} ${label}</button>`;
const actionButtons = (kind, id) => `<div class="card-actions"><button class="icon-button" data-edit="${kind}" data-id="${id}" aria-label="Editar">Editar</button><button class="icon-button danger" data-remove="${kind}" data-id="${id}" aria-label="Excluir">${icon('trash', 17)}</button></div>`;
let data = initialData();
let page = 'home';
let saving = Promise.resolve();
let draftEditor = null;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => toast.classList.remove('show'), 3200);
}
function persist() {
  const snapshot = JSON.stringify(data);
  saving = saving.catch(() => {}).then(async () => {
    if (native) await Preferences.set({key: storageKey, value: snapshot});
    else localStorage.setItem(storageKey, snapshot);
  });
  return saving;
}
async function mutate(operation) {
  const previous = structuredClone(data);
  try {
    operation();
    await persist();
    render();
    return true;
  } catch (error) {
    data = previous;
    notify(error.message || 'Não foi possível salvar.');
    render();
    return false;
  }
}
function heading(kicker, title, sub = '', action = '') {
  return `<div class="section-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${action}</div>`;
}
function section(title, content, right = '') {
  return `<section class="section"><div class="section-title"><h2>${title}</h2>${right}</div>${content}</section>`;
}
function taskRow(task) {
  return `<article class="list-row ${task.done ? 'is-done' : ''}"><button class="tick ${task.done ? 'checked' : ''}" data-toggle="tasks" data-id="${task.id}" aria-label="${task.done ? 'Reabrir' : 'Concluir'} ${esc(task.title)}">${task.done ? '✓' : ''}</button><div class="row-body"><strong>${esc(task.title)}</strong>${task.due_on ? `<small>Até ${esc(formatDate(task.due_on))}</small>` : ''}</div>${actionButtons('tasks', task.id)}</article>`;
}
function routineRow(item) {
  const done = data.routineDays[`${today()}:${item.id}`] === true;
  return `<article class="list-row ${done ? 'is-done' : ''}"><button class="tick ${done ? 'checked' : ''}" data-toggle="routines" data-id="${item.id}" aria-label="${done ? 'Desfazer' : 'Marcar'} ${esc(item.title)}">${done ? '✓' : ''}</button><div class="row-body"><strong>${esc(item.title)}</strong><small>${esc(item.time || 'Todos os dias')}</small></div>${actionButtons('routines', item.id)}</article>`;
}
function billRow(bill) {
  const displayed = billForMonth(bill);
  if (!displayed) return '';
  const paymentKey = `${month()}:${bill.id}`;
  const paid = data.billPayments[paymentKey] === true;
  return `<article class="list-row ${paid ? 'is-done' : ''}"><button class="tick ${paid ? 'checked' : ''}" data-toggle="bills" data-id="${bill.id}" aria-label="Marcar pagamento">${paid ? '✓' : ''}</button><div class="row-body"><strong>${esc(bill.title)}</strong><small>Vence ${esc(formatDate(displayed.due_on))}${bill.repeat ? ' · Mensal' : ''}</small></div><span class="row-money">${money(bill.amount_cents)}</span>${actionButtons('bills', bill.id)}</article>`;
}
function formatDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return date || '';
  const [year, m, day] = date.split('-');
  return `${day}/${m}/${year}`;
}
function renderHome() {
  const finished = data.tasks.filter(item => item.done).length;
  const routineDone = data.routines.filter(item => data.routineDays[`${today()}:${item.id}`]).length;
  const balance = totals(data);
  const pending = data.tasks.filter(item => !item.done);
  const unpaid = data.bills.filter(item => billForMonth(item) && !data.billPayments[`${month()}:${item.id}`]);
  return `<div class="home-top"><span class="eyebrow">${new Intl.DateTimeFormat('pt-BR',{weekday:'long', day:'numeric', month:'long'}).format(new Date()).toUpperCase()}</span><h1>Seu dia, <em>no ritmo.</em></h1><p>Um lugar para organizar o que importa.</p></div>
    <div class="metric-grid"><div class="metric primary-metric"><span>Tarefas concluídas</span><strong>${finished}<small> / ${data.tasks.length}</small></strong><div class="progress"><i style="width:${data.tasks.length ? 100 * finished / data.tasks.length : 0}%"></i></div></div>
    <div class="metric"><span>Rotina de hoje</span><strong>${routineDone}<small> / ${data.routines.length}</small></strong><p>${data.routines.length - routineDone} pendentes</p></div></div>
    <button class="balance-card" data-nav="finance"><span>${icon('wallet', 19)} Saldo do mês</span><strong>${money(balance.income - balance.expense)}</strong><small>Receitas ${money(balance.income)} · Despesas ${money(balance.expense)}</small>${icon('chevron')}</button>
    ${section('Prioridades', pending.length ? pending.slice(0, 4).map(taskRow).join('') : empty('Tudo em dia', 'Adicione uma tarefa para começar.'), `<button class="text-button" data-nav="tasks">Ver todas ${icon('chevron', 14)}</button>`)}
    ${section('Contas deste mês', unpaid.length ? unpaid.slice(0, 3).map(billRow).join('') : empty('Sem contas pendentes', 'Seus pagamentos estão em dia.'), `<button class="text-button" data-nav="finance">Finanças ${icon('chevron', 14)}</button>`)}`;
}
function renderTasks() {
  const active = data.tasks.filter(item => !item.done);
  const done = data.tasks.filter(item => item.done);
  return heading('ORGANIZAÇÃO', 'Tarefas', `${active.length} pendente${active.length === 1 ? '' : 's'}`, buttonAdd('tasks','Nova')) +
    section('A fazer', active.length ? active.map(taskRow).join('') : empty('Lista limpa', 'Nenhuma tarefa pendente.')) +
    (done.length ? section('Concluídas', done.map(taskRow).join('')) : '');
}
function renderRoutine() {
  const complete = data.routines.filter(item => data.routineDays[`${today()}:${item.id}`]).length;
  return heading('CONSISTÊNCIA', 'Rotina', `${complete} de ${data.routines.length} hábitos hoje`, buttonAdd('routines','Adicionar')) +
    `<div class="note-box">A rotina reinicia a cada dia. Seu histórico fica salvo no aparelho.</div>` +
    section('Para hoje', data.routines.length ? data.routines.map(routineRow).join('') : empty('Comece pequeno', 'Adicione um hábito para repetir diariamente.'));
}
function renderFinance() {
  const result = totals(data);
  return heading('CONTROLE', 'Finanças', new Intl.DateTimeFormat('pt-BR',{month:'long', year:'numeric'}).format(new Date()), buttonAdd('transactions','Lançamento')) +
    `<div class="finance-summary"><div><span>Entradas</span><strong class="positive">${money(result.income)}</strong></div><div><span>Saídas</span><strong>${money(result.expense)}</strong></div><div class="finance-net"><span>Saldo do mês</span><strong>${money(result.income-result.expense)}</strong></div></div>` +
    section('Contas a pagar', data.bills.map(billRow).filter(Boolean).join('') || empty('Nenhuma conta', 'Cadastre uma conta avulsa ou mensal.'), buttonAdd('bills','Nova conta')) +
    section('Movimentações', data.transactions.length ? data.transactions.slice(0, 60).map(item => `<article class="list-row"><span class="transaction-icon ${item.type}">${item.type === 'income' ? '↙' : '↗'}</span><div class="row-body"><strong>${esc(item.title)}</strong><small>${esc(formatDate(item.occurred_on))}</small></div><span class="row-money ${item.type === 'income' ? 'positive' : ''}">${item.type === 'income' ? '+' : '−'}${money(item.amount_cents)}</span>${actionButtons('transactions', item.id)}</article>`).join('') : empty('Sem lançamentos', 'Registre entradas e saídas manualmente.'));
}
function renderMore() {
  const links = [['jobs','Vagas','Acompanhe candidaturas','briefcase'], ['spaces','Espaços','Notas e listas pessoais','book'], ['shortcuts','Atalhos','Seus links num lugar','link'], ['settings','Configurações','Tema, backup e dados','settings']];
  return heading('CENTRAL', 'Mais', 'Tudo conectado ao seu dia.') + `<div class="feature-grid">${links.map(([id,label,description,glyph]) => `<button class="feature" data-nav="${id}"><span class="feature-icon">${icon(glyph,25)}</span><strong>${label}</strong><small>${description}</small><span class="feature-chevron">${icon('chevron')}</span></button>`).join('')}</div><div class="note-box">Os dados do Kito Mobile são armazenados neste aparelho. Serviços integrados ao PC requerem a versão desktop.</div>`;
}
function renderJobs() {
  const statuses = {saved:'Salva', applied:'Candidatura enviada', interview:'Entrevista', accepted:'Aprovada', rejected:'Encerrada'};
  return heading('CARREIRA', 'Vagas', `${data.jobs.length} oportunidades acompanhadas`, buttonAdd('jobs','Nova vaga')) +
    section('Suas oportunidades', data.jobs.length ? data.jobs.map(item => `<article class="list-row jobs-row"><span class="transaction-icon">${icon('briefcase')}</span><div class="row-body"><strong>${esc(item.title)}</strong><small>${esc(item.company || 'Empresa não informada')}</small><span class="pill">${statuses[item.status] || statuses.saved}</span></div><div class="job-tools">${item.url ? `<button class="icon-button" data-open="${esc(item.url)}" aria-label="Abrir vaga">${icon('external',17)}</button>` : ''}${actionButtons('jobs',item.id)}</div></article>`).join('') : empty('Sua busca começa aqui', 'Adicione vagas e acompanhe as candidaturas.'));
}
function renderSpaces() {
  return heading('SEU LUGAR', 'Espaços', 'Anotações e listas que ficam com você.', buttonAdd('spaces','Criar espaço')) +
    `<div class="spaces-grid">${data.spaces.map(space => `<article class="space-card"><div class="space-top"><span>${icon('book',23)}</span>${actionButtons('spaces',space.id)}</div><h2>${esc(space.title)}</h2>${space.note ? `<p>${esc(space.note)}</p>` : ''}
      ${(space.items || []).map((entry,index) => `<label class="space-check"><input type="checkbox" data-space-check="${space.id}" data-index="${index}" ${entry.done ? 'checked' : ''}><span>${esc(entry.text)}</span></label>`).join('')}
      ${(space.links || []).map(link => `<button class="space-link" data-open="${esc(link.url)}">${icon('external',14)} ${esc(link.title)}</button>`).join('')}</article>`).join('')}</div>` + (!data.spaces.length ? empty('Seu primeiro espaço', 'Guarde uma nota, um checklist e links importantes.') : '');
}
function renderShortcuts() {
  return heading('ACESSO RÁPIDO', 'Atalhos', 'Sites e ferramentas favoritas.', buttonAdd('shortcuts','Novo atalho')) +
    section('Seus links', data.shortcuts.length ? data.shortcuts.map(item => `<article class="list-row"><span class="transaction-icon">${icon('link')}</span><button class="row-body row-link" data-open="${esc(item.url)}"><strong>${esc(item.title)}</strong><small>${esc(item.url)}</small></button>${actionButtons('shortcuts',item.id)}</article>`).join('') : empty('Adicione um link', 'Acesse seus favoritos pelo Kito.'));
}
function renderSettings() {
  const themes = [['original','Original'],['midnight','Midnight'],['graphite','Graphite'],['light','Light']];
  return heading('PERSONALIZAÇÃO', 'Configurações', 'Seu Kito, do seu jeito.') +
    section('Aparência', `<div class="theme-grid">${themes.map(([id,label]) => `<button data-theme="${id}" class="theme-choice ${data.settings.theme === id ? 'selected' : ''}"><span class="theme-preview ${id}"><i></i><b></b></span><strong>${label}</strong><small>${data.settings.theme === id ? 'Selecionado' : 'Usar tema'}</small></button>`).join('')}</div>`) +
    section('Seus dados', `<div class="settings-actions"><button class="settings-row" data-action="export">${icon('file')}<span><strong>Exportar backup</strong><small>Salve uma cópia dos seus dados em JSON</small></span>${icon('chevron',18)}</button><button class="settings-row" data-action="import">${icon('arrow')}<span><strong>Importar backup</strong><small>Restaure seus dados de um arquivo do Kito Mobile</small></span>${icon('chevron',18)}</button></div>`) +
    `<p class="settings-foot">Kito Mobile v1.0.0 · Os dados são locais e independentes da versão Windows.</p>`;
}
function render() {
  document.documentElement.dataset.theme = data.settings.theme;
  const view = {home:renderHome, tasks:renderTasks, routine:renderRoutine, finance:renderFinance,
    more:renderMore, jobs:renderJobs, spaces:renderSpaces, shortcuts:renderShortcuts, settings:renderSettings};
  main.innerHTML = (view[page] || renderHome)();
  const activeTab = navigation.some(([key]) => key === page) ? page : 'more';
  tabs.innerHTML = navigation.map(([key,label,glyph]) => `<button class="tab ${activeTab === key ? 'active' : ''}" data-nav="${key}" ${activeTab === key ? 'aria-current="page"' : ''}>${icon(glyph,22)}<span>${label}</span></button>`).join('');
  document.querySelector('.header-tag').textContent = pages[page] === 'Hoje' ? 'SEU DIA, NUM LUGAR SÓ.' : pages[page].toUpperCase();
}

const field = (name, label, type = 'text', value = '', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (name, label, options, selected) => `<label class="field"><span>${label}</span><select name="${name}">${options.map(([value,title]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${title}</option>`).join('')}</select></label>`;
function editorFields(kind, current) {
  const value = (key, fallback = '') => current?.[key] ?? fallback;
  const title = field('title', 'Nome', 'text', value('title'), 'required maxlength="100"');
  switch (kind) {
    case 'tasks': return title + field('due_on','Prazo (opcional)','date',value('due_on'));
    case 'routines': return title + field('time','Horário (opcional)','time',value('time'));
    case 'transactions': return title + field('amount','Valor (R$)','text',current ? (current.amount_cents / 100).toFixed(2).replace('.',',') : '', 'required inputmode="decimal" placeholder="0,00"') + select('type','Tipo',[['expense','Despesa'],['income','Receita']],value('type','expense')) + field('occurred_on','Data','date',value('occurred_on',today()),'required');
    case 'bills': return title + field('amount','Valor (R$)','text',current ? (current.amount_cents / 100).toFixed(2).replace('.',',') : '', 'required inputmode="decimal" placeholder="0,00"') + field('due_on','Vencimento','date',value('due_on',today()),'required') + `<label class="field check-field"><input name="repeat" type="checkbox" ${value('repeat',false) ? 'checked' : ''}><span>Repetir mensalmente</span></label>`;
    case 'jobs': return title + field('company','Empresa','text',value('company'),'maxlength="100"') + field('url','Link da vaga (opcional)','url',value('url'),'placeholder="https://"') + select('status','Situação', [['saved','Salva'],['applied','Candidatura enviada'],['interview','Entrevista'],['accepted','Aprovada'],['rejected','Encerrada']],value('status','saved'));
    case 'spaces': return title + `<label class="field"><span>Nota</span><textarea name="note" maxlength="4000" rows="5">${esc(value('note'))}</textarea></label><label class="field"><span>Checklist (um item por linha)</span><textarea name="items" rows="4" maxlength="3000" placeholder="Um item por linha">${esc((value('items',[])).map(item => item.text).join('\n'))}</textarea></label>` + field('link_title','Nome do link (opcional)','text',value('links',[])[0]?.title,'maxlength="100"') + field('link_url','URL do link (opcional)','url',value('links',[])[0]?.url,'placeholder="https://"');
    case 'shortcuts': return title + field('url','URL','url',value('url'),'required placeholder="https://"');
    default: return title;
  }
}
function openEditor(kind, id = null) {
  const existing = id === null ? null : data[kind].find(entry => entry.id === id);
  if (id !== null && !existing) return;
  draftEditor = {kind, id};
  document.querySelector('#editor-title').textContent = existing ? `Editar ${pages[kind] || 'item'}` : 'Novo registro';
  document.querySelector('#editor-fields').innerHTML = editorFields(kind, existing);
  editor.showModal();
  editor.querySelector('input:not([type=checkbox])')?.focus();
}

function editorValues(kind, formData, existing) {
  const title = String(formData.get('title') || '').trim();
  if (!title || title.length > 100) throw Error('Informe um nome de até 100 caracteres.');
  const values = {title};
  if (kind === 'tasks') {
    values.due_on = String(formData.get('due_on') || '');
    if (!existing) values.done = false;
  }
  if (kind === 'routines') values.time = String(formData.get('time') || '');
  if (['transactions','bills'].includes(kind)) {
    values.amount_cents = parseCents(formData.get('amount'));
    if (kind === 'transactions') {
      values.type = String(formData.get('type'));
      values.occurred_on = String(formData.get('occurred_on'));
      if (!['income','expense'].includes(values.type) || !values.occurred_on) throw Error('Dados da movimentação inválidos.');
    } else {
      values.due_on = String(formData.get('due_on'));
      values.repeat = formData.has('repeat');
      if (!values.due_on) throw Error('Informe o vencimento.');
    }
  }
  if (kind === 'jobs') {
    values.company = String(formData.get('company') || '').trim().slice(0, 100);
    values.url = String(formData.get('url') || '').trim();
    if (values.url) values.url = safeUrl(values.url);
    values.status = String(formData.get('status'));
    if (!['saved','applied','interview','accepted','rejected'].includes(values.status)) throw Error('Situação inválida.');
  }
  if (kind === 'spaces') {
    values.note = String(formData.get('note') || '').trim().slice(0,4000);
    const lines = String(formData.get('items') || '').split('\n').map(line => line.trim()).filter(Boolean).slice(0,60);
    const old = existing?.items || [];
    values.items = lines.map(text => ({text: text.slice(0,150), done: Boolean(old.find(item => item.text === text)?.done)}));
    const linkTitle = String(formData.get('link_title') || '').trim().slice(0,100);
    const linkUrl = String(formData.get('link_url') || '').trim();
    values.links = linkUrl ? [{title:linkTitle || linkUrl, url:safeUrl(linkUrl)}] : [];
  }
  if (kind === 'shortcuts') values.url = safeUrl(formData.get('url'));
  return values;
}

async function confirmAction(message) {
  document.querySelector('#confirm-text').textContent = message;
  confirmDialog.showModal();
  return new Promise(resolve => {
    function answer(event) {
      const button = event.target.closest('[data-confirm]');
      if (!button) return;
      cleanup();
      confirmDialog.close();
      resolve(button.dataset.confirm === 'yes');
    }
    function cancelled() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      confirmDialog.removeEventListener('click', answer);
      confirmDialog.removeEventListener('cancel', cancelled);
    }
    confirmDialog.addEventListener('click', answer);
    confirmDialog.addEventListener('cancel', cancelled);
  });
}
async function openLink(raw) {
  try {
    const url = safeUrl(raw);
    if (native) await Browser.open({url});
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) { notify(error.message || 'Não foi possível abrir o link.'); }
}
async function exportData() {
  try {
    const filename = `kito-backup-${today()}.json`;
    const content = JSON.stringify(normalizeData(data), null, 2);
    if (native) {
      const file = await Filesystem.writeFile({path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8});
      await Share.share({title:'Backup Kito', text:'Seu backup do Kito Mobile', url: file.uri, dialogTitle:'Salvar ou compartilhar backup'});
    } else {
      const file = new Blob([content], {type:'application/json'});
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    notify('Backup preparado.');
  } catch (error) { notify(error.message || 'Falha ao criar backup.'); }
}
async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error('O backup excede 5 MB.');
      const imported = normalizeData(JSON.parse(await file.text()));
      if (!await confirmAction('A importação substituirá os registros atuais deste aparelho. Deseja continuar?')) return;
      const done = await mutate(() => { data = imported; });
      if (done) notify('Backup restaurado.');
    } catch (error) { notify(error.message || 'Não foi possível importar o arquivo.'); }
  }, {once:true});
  input.click();
}
function navigate(destination) {
  if (!pages[destination]) return;
  page = destination;
  render();
  main.scrollTo(0, 0);
  window.scrollTo(0,0);
}
document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.close !== undefined) { editor.close(); draftEditor = null; return; }
  if (target.dataset.nav) { navigate(target.dataset.nav); return; }
  if (target.dataset.add) { openEditor(target.dataset.add); return; }
  if (target.dataset.edit) { openEditor(target.dataset.edit, Number(target.dataset.id)); return; }
  if (target.dataset.open) { await openLink(target.dataset.open); return; }
  if (target.dataset.theme) {
    const selected = target.dataset.theme;
    if (!['original','midnight','graphite','light'].includes(selected)) return;
    await mutate(() => { data.settings.theme = selected; });
    return;
  }
  if (target.dataset.action === 'export') { await exportData(); return; }
  if (target.dataset.action === 'import') { await importData(); return; }
  if (target.dataset.toggle) {
    const type = target.dataset.toggle;
    const id = Number(target.dataset.id);
    await mutate(() => {
      if (type === 'tasks') {
        const item = data.tasks.find(entry => entry.id === id);
        if (item) item.done = !item.done;
      } else if (type === 'routines') {
        const key = `${today()}:${id}`;
        data.routineDays[key] = !data.routineDays[key];
      } else if (type === 'bills') {
        const key = `${month()}:${id}`;
        data.billPayments[key] = !data.billPayments[key];
      }
    });
    return;
  }
  if (target.dataset.remove) {
    const {remove:kind} = target.dataset;
    const id = Number(target.dataset.id);
    const item = data[kind]?.find(entry => entry.id === id);
    if (!item || !await confirmAction(`Excluir “${item.title}”?`)) return;
    if (await mutate(() => { data[kind] = data[kind].filter(entry => entry.id !== id); })) notify('Registro excluído.');
  }
});
document.addEventListener('change', async event => {
  const input = event.target.closest('[data-space-check]');
  if (!input) return;
  const id = Number(input.dataset.spaceCheck);
  const index = Number(input.dataset.index);
  await mutate(() => {
    const space = data.spaces.find(item => item.id === id);
    if (space?.items?.[index]) space.items[index].done = input.checked;
  });
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!draftEditor) return;
  const {kind, id} = draftEditor;
  const item = id === null ? null : data[kind].find(entry => entry.id === id);
  try {
    const values = editorValues(kind, new FormData(form), item);
    form.querySelector('[type=submit]').disabled = true;
    const done = await mutate(() => {
      if (item) Object.assign(item, values);
      else newEntry(data, kind, values);
    });
    if (done) { editor.close(); draftEditor = null; notify('Salvo com sucesso.'); }
  } catch (error) { notify(error.message || 'Verifique os campos.'); }
  finally { form.querySelector('[type=submit]').disabled = false; }
});

async function start() {
  try {
    const saved = native ? (await Preferences.get({key:storageKey})).value : localStorage.getItem(storageKey);
    if (saved) data = normalizeData(JSON.parse(saved));
  } catch (error) {
    main.innerHTML = `<div class="startup-error"><h1>Não foi possível ler os dados</h1><p>O armazenamento local precisa ser recuperado antes de continuar. Seus dados não foram alterados.</p></div>`;
    console.error('Kito storage load failed', error);
    return;
  }
  render();
  if (native) {
    try {
      await StatusBar.setBackgroundColor({color: '#141615'});
      await StatusBar.setStyle({style: Style.Dark});
    } catch (error) { console.warn('Status bar', error); }
    App.addListener('backButton', () => {
      if (editor.open) editor.close();
      else if (confirmDialog.open) confirmDialog.close();
      else if (page !== 'home') navigate(navigation.some(([key]) => key === page) ? 'home' : 'more');
      else App.minimizeApp();
    });
  }
}
start();
