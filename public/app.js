const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const csrf = $('meta[name="csrf-token"]').content;
const main = $('#main-content');
const dialogBackdrop = $('#dialog-backdrop');
const state = { view: 'overview', hub: null, banking: null, jobs: [], counts: {}, activity: null, pc: null, jobFilter: 'all', jobSearch: '',
  bankSearch: '', bankDirection: 'all', bankLoadError: false, bankSyncError: null,
  bankExpanded: { connections: false, movements: true }, mailStatus: null, mailThreads: [], mailThread: null,
  mailSearch: '', mailFilter: 'all', mailDraft: '', mailError: '', mailLoading: false,
  mailConnecting: false, mailCancelling: false, mailNotice: '', mailSelectedId: '', mailThreadLoading: false,
  startup: null, startupError: '' };

if (window.wndWindow?.startupStatus) {
  window.wndWindow.startupStatus().then(status => {
    state.startup = status;
    if (state.view === 'settings' && state.hub) render();
  }).catch(error => {
    state.startupError = error.message;
    if (state.view === 'settings' && state.hub) render();
  });
}

const paths = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18M10 13v2h4v-2"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  wallet: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9V7a3 3 0 0 1 3-3h12M16 14h5M16 14a1 1 0 1 0 2 0 1 1 0 1 0-2 0"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="14" rx="2"/><path d="M9 21h6M12 17.5V21"/>',
  link: '<path d="M10.5 13.5a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M13.5 10.5a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
  settings: '<path d="M12 3.5l1.1 2.1 2.4.5 1.9-1.5 2 2-1.5 1.9.5 2.4 2.1 1.1-2.1 1.1-.5 2.4 1.5 1.9-2 2-1.9-1.5-2.4.5-1.1 2.1-1.1-2.1-2.4-.5-1.9 1.5-2-2 1.5-1.9-.5-2.4-2.1-1.1 2.1-1.1.5-2.4-1.5-1.9 2-2 1.9 1.5 2.4-.5L12 3.5Z"/><circle cx="12" cy="12" r="2.4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.4 6M20 5v6h-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external: '<path d="M13 4h7v7M20 4l-9 9"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  inbox: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h5l2 3h4l2-3h5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5"/>',
  activity: '<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
};
function icon(key, size=18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]||paths.overview}</svg>`; }
$$('[data-icon]').forEach(el => {el.innerHTML=icon(el.dataset.icon,el.closest('.topbar')?19:18);});

if (window.wndWindow) {
  $$('[data-window-action]').forEach(button => {
    button.addEventListener('click', () => window.wndWindow[button.dataset.windowAction]());
  });
  const maximizeButton = $('[data-window-action="maximize"]');
  const updateMaximize = maximized => {
    maximizeButton.classList.toggle('is-maximized', maximized);
    maximizeButton.setAttribute('aria-label', maximized ? 'Restaurar janela' : 'Maximizar janela');
    maximizeButton.title = maximized ? 'Restaurar' : 'Maximizar';
  };
  window.wndWindow.onMaximizedChange(updateMaximize);
  window.wndWindow.isMaximized().then(updateMaximize).catch(() => {});
}

const labels = {overview:'Hoje',vagas:'Vagas & propostas',correio:'Correio',tasks:'Tarefas',routine:'Rotina',finance:'Finanças',pc:'Meu PC',shortcuts:'Atalhos',spaces:'Espaços',settings:'Configurações'};
const moduleLabels = {tasks:'Tarefas',routine:'Rotina',finance:'Finanças',pc:'Meu PC',shortcuts:'Atalhos'};
const overviewCardLabels = {jobs:'Caixa de entrada',tasks:'Em andamento',routine:'Sua rotina',finance:'Finanças',pc:'Este computador'};
const overviewCardSelectors = {jobs:'.review-panel',tasks:'.tasks-panel',routine:'.routine-panel',finance:'.finance-panel',pc:'.pc-panel'};
const defaultOverviewLayout = {main:['jobs','tasks'],aside:['routine','finance','pc']};
const currentOverviewLayout = () => state.hub?.overview_layout || defaultOverviewLayout;
const statuses = {pending_review:'Aguardando revisão',approved:'Aprovada',submitting:'Em processamento',rejected:'Rejeitada',submitted:'Enviada',needs_action:'Ação necessária',failed:'Falha no envio'};
const escapeHTML = val => String(val??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const text = val => escapeHTML(val||'—');
const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
let hideBalances = localStorage.getItem('kito.hideBalances') === 'true';
const displayMoney = cents => hideBalances ? '••••••' : money(cents);
const bankMoney = (cents, currency='BRL') => {
  if(cents==null)return '—';
  try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(Number(cents)/100);}
  catch{return `${(Number(cents)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})} ${escapeHTML(currency)}`;}
};
const displayBankMoney = (cents, currency='BRL') => hideBalances ? '••••••' : bankMoney(cents, currency);
const balanceButton = () => `<button type="button" class="button outline balance-visibility" data-action="toggle-balance-visibility" aria-pressed="${hideBalances}" aria-label="${hideBalances?'Mostrar':'Ocultar'} valores financeiros">${icon('shield',15)} ${hideBalances?'Mostrar valores':'Ocultar valores'}</button>`;
const fmtDate = date => date?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${date.slice(0,10)}T12:00:00`)):'Sem data';
const fmtTime = date => date?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(date)):'—';
const localDay = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const percent = (n,max) => max?Math.round(n/max*100):0;
const button = (label, action, iconName='plus', cls='button primary') => `<button class="${cls}" data-action="${action}">${icon(iconName,16)}<span>${label}</span></button>`;
const empty = (heading,description,act='',label='') => `<div class="empty-state"><span class="empty-art">${icon('spark',24)}</span><h3>${heading}</h3><p>${description}</p>${act?button(label,act,'plus','button subtle'):''}</div>`;
const statusBadge = status => `<span class="status status-${escapeHTML(status)}"><span></span>${statuses[status]||'Sem status'}</span>`;
const note = label => `<span class="tiny-note">${label}</span>`;
const cardHeading = (title,side='') => `<div class="card-heading"><h2>${title}</h2>${side}</div>`;

async function api(path, data) {
  const options = data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(data)};
  const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store'});
  const result=await response.json();
  if(!response.ok) throw Error(result.error||`Falha HTTP ${response.status}`);
  return result;
}
let loadRequestId = 0;
let lastLoadedAt = 0;
let pendingRefreshRender = false;
async function load({silent=false,forceRender=false}={}) {
  const requestId=++loadRequestId;
  const day=localDay();
  const paths=[`/api/hub?day=${day}`,'/api/opportunities',...(silent?[]:['/api/pc']),'/api/activity',`/api/banking?month=${day.slice(0,7)}`];
  const results=await Promise.allSettled(paths.map(path=>api(path)));
  if(requestId!==loadRequestId)return false;
  const [hubResult,jobsResult,pcResult,activityResult,bankResult]=silent?
    [results[0],results[1],null,results[2],results[3]]:results;
  const before=silent?JSON.stringify([state.hub,state.jobs,state.counts,state.activity,state.banking,state.bankLoadError]):null;
  if(hubResult.status==='fulfilled')state.hub=hubResult.value;
  if(jobsResult.status==='fulfilled'){state.jobs=jobsResult.value.items;state.counts=Object.fromEntries(jobsResult.value.stats.map(s=>[s.status,s.count]));}
  if(pcResult?.status==='fulfilled')state.pc=pcResult.value;
  if(activityResult.status==='fulfilled')state.activity=activityResult.value;
  if(bankResult.status==='fulfilled')state.banking=bankResult.value;
  state.bankLoadError=bankResult.status==='rejected';
  const errors=results.filter(r=>r.status==='rejected');
  if(errors.length && !silent)toast(errors[0].reason.message,'error');
  if(hubResult.status==='rejected' && jobsResult.status==='rejected'){
    if(silent)return false;
    throw Error('Não foi possível carregar os dados locais.');
  }
  const pending=state.counts.pending_review||0;
  for(const badge of [$('#nav-pending'),$('#topbar-pending')]){
    badge.textContent=pending;
    badge.hidden=pending===0;
  }
  lastLoadedAt=Date.now();
  const bankStatus=state.bankLoadError?' · Bancos indisponíveis':state.bankSyncError&&connectedBanks()?' · Falha na sincronização bancária':' · Dados locais';
  $('#footer-sync').textContent=`${errors.length?'Leitura parcial':'Dados locais consultados'} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}${bankStatus}`;
  if(!silent || forceRender || before!==JSON.stringify([state.hub,state.jobs,state.counts,state.activity,state.banking,state.bankLoadError])){
    if(silent && editingInProgress()){
      pendingRefreshRender=true;
      return errors.length===0;
    }
    pendingRefreshRender=false;
    const focused=document.activeElement;
    const focusedId=focused?.closest('#main-content')?focused.id:null;
    const selection=focusedId&&['text','search','email','url','tel','password'].includes(focused.type)?
      {start:focused.selectionStart,end:focused.selectionEnd}:null;
    render();
    if(focusedId){
      const replacement=document.getElementById(focusedId);
       if(replacement){replacement.focus({preventScroll:true});if(selection)replacement.setSelectionRange(selection.start,selection.end);}
    }
  }
  return errors.length===0;
}
const mobileQuery=window.matchMedia('(max-width:740px)');
const mobileMenu=$('#mobile-menu');
const mobileShade=$('#mobile-shade');
const sidebar=$('#sidebar-navigation');
function setMobileMenu(open,{restoreFocus=false}={}){
  const expanded=Boolean(open&&mobileQuery.matches);
  document.body.classList.toggle('sidebar-open',expanded);
  mobileMenu.setAttribute('aria-expanded',String(expanded));
  mobileMenu.setAttribute('aria-label',expanded?'Fechar menu':'Abrir menu');
  mobileShade.hidden=!expanded;
  sidebar.inert=mobileQuery.matches&&!expanded;
  if(expanded){
    (sidebar.querySelector('.nav-link.active')||sidebar.querySelector('a[href]'))?.focus({preventScroll:true});
  }else if(restoreFocus){
    mobileMenu.focus({preventScroll:true});
  }
}
function navigate(view,updateHash=true,focusContent=false){
  if(!labels[view] && !state.hub?.spaces?.some(s=>`space-${s.id}`===view))view='overview';
  if(state.hub && state.hub.modules[view]===false)view='overview';
  state.view=view;
  if(updateHash && location.hash!==`#${view}`)history.replaceState(null,'',`#${view}`);
  setMobileMenu(false);
  render();
  if(focusContent)main.focus({preventScroll:true});
  if(view==='correio')refreshMail({inbox:true}).catch(error=>{state.mailError=error.message;renderMailIfVisible();});
}
const commandBackdrop=$('#command-backdrop');
const commandSearch=$('#command-search');
const commandInput=$('#command-input');
const commandResults=$('#command-results');
let focusBeforeCommand=null;
const commandIcons={overview:'overview',vagas:'briefcase',correio:'inbox',tasks:'check',routine:'calendar',finance:'wallet',pc:'monitor',shortcuts:'link',spaces:'overview',settings:'settings'};
function commandItems(){
  const actions=[
    {action:'task',label:'Nova tarefa',kind:'Ação rápida',icon:'check',module:'tasks'},
    {action:'routine',label:'Nova atividade na rotina',kind:'Ação rápida',icon:'calendar',module:'routine'},
    {action:'finance',label:'Novo lançamento',kind:'Ação rápida',icon:'wallet',module:'finance'},
    {action:'job',label:'Adicionar vaga',kind:'Ação rápida',icon:'briefcase',module:'vagas'},
    {view:'vagas',label:'Buscar vagas',kind:'Acesso rápido',icon:'search',module:'vagas'}
  ].filter(item=>state.hub.modules[item.module]!==false);
  const modules=Object.entries(labels)
    .filter(([view])=>state.hub.modules[view]!==false)
    .map(([view,label])=>({view,label,kind:'Módulo',icon:commandIcons[view]}));
  const spaces=state.hub.spaces.map(space=>({view:`space-${space.id}`,label:space.title,kind:'Espaço',icon:'overview'}));
  return [...actions,...modules,...spaces];
}
function renderCommandResults(){
  const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const query=normalize(commandInput.value.trim());
  const matches=commandItems().filter(item=>normalize(item.label).includes(query));
  commandResults.innerHTML=matches.length?(query?'':'<p class="command-group-title">Ações e páginas</p>')+matches.map(item=>`<button type="button" class="command-option" ${item.action?`data-command-action="${item.action}"`:`data-command-view="${escapeHTML(item.view)}"`}><span class="command-icon">${icon(item.icon,17)}</span><span class="command-title">${text(item.label)}</span><span class="command-kind">${item.kind}</span></button>`).join(''):'<p class="command-empty">Nenhum resultado encontrado.</p>';
}
function openCommand(){
  if(!state.hub||!dialogBackdrop.hidden)return;
  if(!commandBackdrop.hidden){commandInput.focus();commandInput.select();return;}
  focusBeforeCommand=document.activeElement;
  setMobileMenu(false);
  commandInput.value='';
  renderCommandResults();
  commandBackdrop.hidden=false;
  commandSearch.setAttribute('aria-expanded','true');
  commandInput.focus();
}
function closeCommand(restoreFocus=true){
  if(commandBackdrop.hidden)return;
  commandBackdrop.hidden=true;
  commandSearch.setAttribute('aria-expanded','false');
  if(restoreFocus)(focusBeforeCommand?.isConnected?focusBeforeCommand:commandSearch).focus({preventScroll:true});
  focusBeforeCommand=null;
}
commandSearch.addEventListener('click',openCommand);
commandInput.addEventListener('input',renderCommandResults);
commandResults.addEventListener('click',event=>{
  const choice=event.target.closest('[data-command-view], [data-command-action]');
  if(!choice)return;
  if(choice.dataset.commandAction){
    closeCommand();
    addDialog(choice.dataset.commandAction);
    return;
  }
  closeCommand(false);
  navigate(choice.dataset.commandView,true,true);
});
commandBackdrop.addEventListener('click',event=>{if(event.target===commandBackdrop)closeCommand();});
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='k'){
    if(!dialogBackdrop.hidden)return;
    event.preventDefault();
    openCommand();
    return;
  }
  if(commandBackdrop.hidden)return;
  if(event.key==='Escape'){
    event.preventDefault();
    closeCommand();
    return;
  }
  const options=$$('.command-option',commandResults);
  const index=options.indexOf(document.activeElement);
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    if(!options.length)return;
    const next=event.key==='ArrowDown'?(index+1)%options.length:(index<0?options.length-1:index-1);
    (options[next]||commandInput).focus();
  }else if(event.key==='Enter'&&document.activeElement===commandInput&&options.length){
    event.preventDefault();
    options[0].click();
  }else if(event.key==='Tab'){
    const first=commandInput,last=options.at(-1)||commandInput;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
function spaceForView(){return state.hub?.spaces?.find(s=>`space-${s.id}`===state.view);}
function renderSpaceNav(){
  $('#space-nav').innerHTML=(state.hub.spaces.length?'<p class="nav-label nav-label-custom">SEUS ESPAÇOS</p>':'')+state.hub.spaces.map(s=>`<a href="#space-${s.id}" data-view="space-${s.id}" class="nav-link custom-nav" title="${escapeHTML(s.title)}" aria-label="${escapeHTML(s.title)}" data-tip="${escapeHTML(s.title)}"><span class="custom-nav-mark"></span><span>${text(s.title)}</span></a>`).join('');
}
function render(){
  if(!state.hub)return;
  renderSpaceNav();
  $$('[data-module]').forEach(el=>el.hidden=state.hub.modules[el.dataset.module]===false);
  const hour=new Date().getHours();
  $('#topbar-date').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const views={overview:overviewView,vagas:jobsView,correio:mailView,tasks:tasksView,routine:routineView,finance:financeView,pc:pcView,shortcuts:shortcutsView,spaces:spacesView,settings:settingsView};
  const chosen=spaceForView();
  if(!views[state.view]&&!chosen)state.view='overview';
  const label=chosen?.title||labels[state.view];
  $('#breadcrumb').textContent=label;
  document.title=`${label} · Kito`;
  $$('.nav-link').forEach(el=>{const active=el.dataset.view===state.view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  main.innerHTML=chosen?spaceView(chosen):views[state.view]();
  main.dataset.view=state.view;
  if(state.view==='overview'){
    const grid=main.querySelector('.dashboard-grid');
    const cards=Object.fromEntries(Object.entries(overviewCardSelectors).map(([key,selector])=>[key,grid.querySelector(selector)]));
    const layout=currentOverviewLayout();
    for(const [column,keys] of [['main',layout.main],['aside',layout.aside]]){
      const container=grid.querySelector(`.dashboard-${column}`);
      for(const key of keys)container.append(cards[key]);
    }
    // Os utilitários acompanham as colunas sem entrar na ordem dos cinco cards editáveis.
    const spaces=main.querySelector('.overview-spaces');
    const spacesSlot=document.createElement('div');
    spacesSlot.className='overview-utilities';
    spacesSlot.append(spaces);
    grid.querySelector('.dashboard-main').append(spacesSlot);
    const shortcuts=main.querySelector('.overview-shortcuts');
    if(shortcuts){
      const shortcutsSlot=document.createElement('div');
      shortcutsSlot.className='overview-utilities';
      shortcutsSlot.append(shortcuts);
      shortcutsSlot.hidden=state.hub.modules.shortcuts===false;
      grid.querySelector('.dashboard-aside').append(shortcutsSlot);
    }
    grid.querySelector('.dashboard-main').hidden=false;
    grid.querySelector('.dashboard-aside').hidden=layout.aside.length===0&&(!shortcuts||state.hub.modules.shortcuts===false);
    grid.classList.toggle('single-column',layout.main.length===0||layout.aside.length===0);
    main.querySelector('.greeting')?.setAttribute('data-hour',hour);
    const modules=state.hub.modules;
    const stats=main.querySelectorAll('.stat-cell');
    ['tasks','routine','finance','pc'].forEach((key,i)=>{stats[i].hidden=modules[key]===false;});
    const visible=['tasks','routine','finance','pc'].filter(key=>modules[key]!==false).length;
    const strip=main.querySelector('.overview-stats');strip.hidden=!visible;strip.style.setProperty('--stat-count',visible);
    const gauge=main.querySelector('.decision-gauge');
    if(gauge)gauge.style.setProperty('--gauge-value',`${percent(state.counts.pending_review||0,state.jobs.length)}%`);
    const finance=overviewFinance();
    const movement=Math.max(0,finance.income)+Math.max(0,finance.expense);
    const incomeRatio=percent(Math.max(0,finance.income),movement);
    main.querySelector('.money-income').style.width=`${incomeRatio}%`;
    main.querySelector('.money-expense').style.width=`${movement?100-incomeRatio:0}%`;
    const agenda=main.querySelector('.overview-agenda');
    if(agenda)agenda.hidden=modules.routine===false;
    for(const [selector,key] of [['.tasks-panel','tasks'],['.routine-panel','routine'],['.finance-panel','finance'],['.pc-panel','pc'],['.overview-shortcuts','shortcuts']]){
      const el=main.querySelector(selector);if(el)el.hidden=modules[key]===false;
    }
  }
}
function pageHeading(title,subtitle,action='') {return `<section class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</section>`;}
function sectionLink(view,label='Ver tudo'){return `<a class="section-link" href="#${view}" data-view="${view}">${label} ${icon('arrow',15)}</a>`;}
const isInternship = j => /estagi(?:o|ari[oa])|\bintern(?:ship)?\b/i.test(`${j.title||''} ${j.contract_type||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
function jobRow(j,compact=false){return `<button class="job-row ${compact?'job-compact':''}" data-action="job-detail" data-id="${j.id}"><span class="job-monogram">${escapeHTML((j.company||'?').slice(0,1).toUpperCase())}</span><span class="job-name"><strong>${text(j.title)}</strong><small>${text(j.company)}<span class="middle-dot">·</span>${text(j.contract_type||j.source||'Oportunidade')}${Number.isInteger(j.match_score)?`<span class="job-match"><span class="middle-dot">·</span>${j.match_score}/100 aderência</span>`:''}</small></span>${statusBadge(j.status)}<span class="job-arrow">${icon('chevron',17)}</span></button>`;}
function taskRow(t,compact=false){const overdue=!t.done&&t.due_date&&t.due_date.slice(0,10)<localDay();return `<div class="task-row ${t.done?'completed':''} ${overdue?'task-overdue':''}"><label class="task-label"><input class="custom-check" type="checkbox" data-action="toggle-task" data-id="${t.id}" ${t.done?'checked':''}><span class="task-line"><strong>${text(t.title)}</strong><small>${overdue?'Atrasada · ':''}${t.due_date?fmtDate(t.due_date):'Sem prazo'}${t.priority==='high'?' · Prioridade alta':''}</small></span></label>${compact?'':`<button data-action="delete-task" data-id="${t.id}" class="quiet-icon" aria-label="Excluir tarefa ${escapeHTML(t.title)}" title="Excluir tarefa">${icon('trash',16)}</button>`}</div>`;}
function routineRow(r,compact=false){return `<div class="task-row ${r.done?'completed':''}"><label class="task-label"><input class="custom-check" type="checkbox" data-action="toggle-routine" data-id="${r.id}" ${r.done?'checked':''}><span class="task-line"><strong>${text(r.title)}</strong><small>${r.time||'Sem horário'}</small></span></label>${compact?'':`<button data-action="delete-routine" data-id="${r.id}" class="quiet-icon" aria-label="Excluir ${escapeHTML(r.title)}" title="Excluir atividade">${icon('trash',16)}</button>`}</div>`;}
function overviewFinance(){
  const manual=state.hub.finance;
  const items=state.banking?.items||[];
  const hasImportedBank=items.some(item=>item.last_synced_at);
  if(!hasImportedBank || !state.banking?.insights){
    return {balance:manual.balance,income:manual.income,expense:manual.expense,
      source:items.length?'Registros manuais · bancos aguardando sincronização':'Registros manuais',bank:false};
  }
  const insights=state.banking.insights;
  const dates=items.map(item=>Date.parse(item.last_synced_at)).filter(Number.isFinite);
  const oldest=dates.length?Math.min(...dates):null;
  const warning=state.bankLoadError||state.bankSyncError||items.some(item=>item.last_error||!item.last_synced_at);
  const source=state.bankLoadError?'Bancos · consulta indisponível':state.bankSyncError?'Bancos · atualização falhou':warning?'Bancos · conexão pendente':
    `Bancos · sincronizado ${fmtTime(new Date(oldest).toISOString())}`;
  return {balance:insights.netCents,income:insights.incomeCents,expense:insights.expenseCents,source,bank:true};
}
function overviewView(){
  const h=state.hub,jobs=state.jobs,pending=state.counts.pending_review||0;
  const finances=overviewFinance();
  const activeTasks=h.tasks.filter(t=>!t.done),doneR=h.routines.filter(r=>r.done).length;
  const greeting=new Date().getHours()<12?'Bom dia':new Date().getHours()<18?'Boa tarde':'Boa noite';
  const completedTasks=h.tasks.length-activeTasks.length;
  const taskProgress=percent(completedTasks,h.tasks.length);
  const routineProgress=percent(doneR,h.routines.length);
  const pendingRatio=percent(pending,jobs.length);
  const today=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const agenda=[...h.routines].sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')).slice(0,5);
  return `<section class="dashboard-intro">
    <div class="intro-content">
      <div class="greeting"><span class="greeting-dot"></span> ${greeting} · ${escapeHTML(today)}</div>
      <h1>Seu dia, num lugar só.</h1>
      <p>O que importa hoje, à sua maneira.</p>
      <div class="intro-actions">${button('Ver oportunidades','go-vagas','briefcase')}${button('Nova tarefa','add-task','plus','button outline')}</div>
    </div>
    <div class="intro-side">
      <div class="intro-side-text"><div class="intro-side-top"><span>REVISÃO DE CANDIDATURAS</span>${icon('inbox',17)}</div><strong class="intro-counter">${String(pending).padStart(2,'0')}</strong><p>${pending===1?'oportunidade aguardando':'oportunidades aguardando'} sua decisão</p><span class="intro-foot">${jobs.length} ${jobs.length===1?'oportunidade registrada':'oportunidades registradas'}</span></div>
      <div class="decision-gauge" role="img" aria-label="${pendingRatio}% das oportunidades aguardando revisão"><span>${pendingRatio}<small>%</small></span></div>
    </div>
  </section>
  <section class="overview-stats" aria-label="Resumo">
    <div class="stat-cell">
      <div class="stat-heading">${icon('check',16)}<span>Tarefas em aberto</span></div>
      <strong>${String(activeTasks.length).padStart(2,'0')}</strong>
      <small>${completedTasks} concluídas de ${h.tasks.length}</small>
      <progress class="progress-meter metric-progress" value="${taskProgress}" max="100" aria-label="${taskProgress}% das tarefas concluídas"></progress>
      <span class="metric-caption">${taskProgress}% concluído</span>
    </div>
    <div class="stat-cell">
      <div class="stat-heading">${icon('calendar',16)}<span>Rotina de hoje</span></div>
      <strong>${doneR}<em> / ${h.routines.length}</em></strong>
      <small>${h.routines.length?'atividades realizadas':'Nenhuma atividade criada'}</small>
      <progress class="progress-meter metric-progress" value="${routineProgress}" max="100" aria-label="${routineProgress}% da rotina concluída"></progress>
      <span class="metric-caption">${routineProgress}% do dia</span>
    </div>
    <div class="stat-cell">
       <div class="stat-heading">${icon('wallet',16)}<span>Resultado do mês</span></div>
       <strong class="amount-stat">${displayMoney(finances.balance)}</strong>
       <small>${escapeHTML(finances.source)}</small>
      <div class="money-track" aria-label="Proporção de entradas e saídas"><span class="money-income"></span><span class="money-expense"></span></div>
      <span class="metric-caption"><span class="money-key income-key"></span> Entradas <span class="money-key expense-key"></span> Saídas</span>
    </div>
    <div class="stat-cell">
      <div class="stat-heading">${icon('monitor',16)}<span>Memória utilizada</span></div>
      <strong data-pc-value="overview-memory">${state.pc?.memory_percent??'—'}<em>${state.pc?'%':''}</em></strong>
      <small>Uso atual do computador</small>
      <progress data-pc-meter="overview-memory" class="progress-meter metric-progress" value="${state.pc?.memory_percent||0}" max="100" aria-label="Uso da memória"></progress>
      <span class="metric-caption">Monitoramento local</span>
    </div>
  </section>
  <div class="dashboard-grid"><div class="dashboard-main"><section class="panel review-panel">${cardHeading('Caixa de entrada',sectionLink('vagas'))}<p class="panel-description">Oportunidades encontradas e decisões recentes.</p><div class="job-list">${jobs.length?jobs.slice(0,4).map(j=>jobRow(j,true)).join(''):empty('Nenhuma oportunidade ainda','Salve uma vaga pelo link do anúncio para começar a acompanhar suas candidaturas.','add-job','Adicionar vaga')}</div></section>
  <section class="panel tasks-panel">${cardHeading('Em andamento',sectionLink('tasks','Tarefas'))}<p class="panel-description">O que você ainda precisa resolver.</p><div class="task-list">${activeTasks.length?activeTasks.slice(0,4).map(t=>taskRow(t,true)).join(''):empty('Lista em dia','Nenhuma tarefa pendente.','add-task','Criar tarefa')}</div></section></div>
  <div class="dashboard-aside"><section class="panel routine-panel">${cardHeading('Sua rotina',sectionLink('routine'))}<div class="progress-header"><strong>${doneR} de ${h.routines.length}</strong><span>${percent(doneR,h.routines.length)}%</span></div><progress class="progress-meter" value="${percent(doneR,h.routines.length)}" max="100" aria-label="Progresso da rotina"></progress><div class="mini-routines">${h.routines.length?h.routines.slice(0,3).map(r=>routineRow(r,true)).join(''):'<p class="empty-small">Adicione hábitos para acompanhar seus dias.</p>'}</div></section>
  <section class="panel finance-panel">${cardHeading('Finanças',state.hub.modules.finance?sectionLink('finance'):'')}<span class="finance-label">RESULTADO EM ${escapeHTML(new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date()).replace('.','').toUpperCase())}</span><strong class="finance-balance">${displayMoney(finances.balance)}</strong><div class="finance-split"><span>${icon('arrow',15)} Entradas <strong>${displayMoney(finances.income)}</strong></span><span>${icon('arrow',15)} Saídas <strong>${displayMoney(finances.expense)}</strong></span></div><small class="finance-source">${escapeHTML(finances.source)}</small>${balanceButton()}</section>
  <section class="panel pc-panel">${cardHeading('Este computador',sectionLink('pc','Detalhes'))}<div class="pc-mini"><div><span>CPU</span><strong data-pc-value="mini-cpu">${state.pc?.cpu_percent===null?'—':(state.pc?.cpu_percent??'—')+'%'}</strong></div><progress data-pc-meter="mini-cpu" class="progress-meter compact" value="${state.pc?.cpu_percent||0}" max="100" aria-label="Uso da CPU"></progress><div><span>MEMÓRIA</span><strong data-pc-value="mini-memory">${state.pc?.memory_percent??'—'}%</strong></div><progress data-pc-meter="mini-memory" class="progress-meter compact" value="${state.pc?.memory_percent||0}" max="100" aria-label="Uso da memória"></progress></div></section></div></div>
  ${h.shortcuts.length?`<section class="overview-shortcuts"><div class="shortcuts-heading"><h2>Acesso rápido</h2>${sectionLink('shortcuts','Gerenciar')}</div><div class="shortcut-inline">${h.shortcuts.slice(0,5).map(s=>`<a target="_blank" rel="noopener noreferrer" href="${escapeHTML(s.url)}">${icon('external',15)}${text(s.label)}</a>`).join('')}</div></section>`:''}
  <section class="overview-spaces"><div class="shortcuts-heading"><h2>Seus espaços</h2>${sectionLink('spaces','Ver todos')}</div><p class="panel-description">Organize qualquer assunto com notas, checklists e links.</p><div class="shortcut-inline">${h.spaces.slice(0,4).map(s=>`<a href="#space-${s.id}" data-view="space-${s.id}">${icon('overview',15)}${text(s.title)}</a>`).join('')}<button class="space-quick-add" data-action="add-space">${icon('plus',15)} Novo espaço</button></div></section>
  <section class="panel overview-agenda" aria-label="Agenda de hoje">
    <div class="agenda-heading"><div><span class="agenda-kicker">SUA ROTINA</span><h2>Agenda de hoje</h2></div><div class="agenda-actions"><span>${escapeHTML(today)}</span>${sectionLink('routine','Abrir rotina')}</div></div>
    <div class="agenda-track">${agenda.length?agenda.map(r=>`<label class="agenda-slot ${r.done?'is-done':''}"><span class="agenda-slot-time">${escapeHTML(r.time||'Sem horário')}</span><span class="agenda-slot-row"><input class="custom-check" type="checkbox" data-action="toggle-routine" data-id="${r.id}" ${r.done?'checked':''}><span class="agenda-slot-title" title="${escapeHTML(r.title)}">${text(r.title)}</span></span><span class="agenda-slot-status"><span></span>${r.done?'Concluída':'Pendente'}</span></label>`).join(''):`<div class="agenda-empty"><span>Sem atividades para hoje.</span>${button('Adicionar atividade','add-routine','plus','button outline')}</div>`}</div>
  </section>`;
}
function filteredJobs(){
  const query=state.jobSearch.trim().toLocaleLowerCase('pt-BR');
  return state.jobs.filter(j=>(state.jobFilter==='all'||(state.jobFilter==='internship'?isInternship(j):j.status===state.jobFilter))&&`${j.company||''} ${j.title||''} ${j.source||''} ${j.requirements||''}`.toLocaleLowerCase('pt-BR').includes(query));
}
function jobResultsMarkup(jobs){
  return jobs.length?jobs.map(j=>{
    const actions=[];
    if(['pending_review','approved','needs_action','failed'].includes(j.status))actions.push(`<button type="button" class="quiet-icon" data-action="reject-job" data-id="${j.id}" title="Não tenho interesse" aria-label="Rejeitar vaga ${escapeHTML(j.title)}">${icon('close',17)}</button>`);
    if(!['submitting','submitted'].includes(j.status))actions.push(`<button type="button" class="quiet-icon job-delete-action" data-action="delete-job" data-id="${j.id}" title="Excluir definitivamente" aria-label="Excluir vaga ${escapeHTML(j.title)}">${icon('trash',17)}</button>`);
    return `<div class="job-list-item">${jobRow(j)}<div class="job-list-actions">${actions.join('')}</div></div>`;
  }).join(''):empty('Nenhuma vaga encontrada',state.jobs.length?'Tente outro filtro ou termo de busca.':'Adicione uma oportunidade pelo link do anúncio ou configure seus critérios de busca.','add-job','Adicionar vaga');
}
function updateJobResults(){
  const table=main.querySelector('.job-table');
  if(!table)return;
  const filtered=filteredJobs();
  table.querySelectorAll(':scope > .job-list-item, :scope > .empty-state').forEach(el=>el.remove());
  table.insertAdjacentHTML('beforeend',jobResultsMarkup(filtered));
  const note=main.querySelector('.count-note');
  if(note)note.textContent=`${filtered.length} ${filtered.length===1?'oportunidade':'oportunidades'}`;
}
function jobsView(){
  const filters=[['all','Todas'],['pending_review','Para revisar'],['internship','Estágios'],['approved','Aprovadas'],['submitting','Processando'],['needs_action','Ação necessária'],['failed','Falhas'],['submitted','Enviadas'],['rejected','Rejeitadas']];
  const filtered=filteredJobs();
  return `${pageHeading('Vagas & propostas','Analise oportunidades e acompanhe cada candidatura.',`<div class="job-heading-actions">${button('Adicionar vaga','add-job')}${button('Preferências','go-settings','settings','button outline')}${button('Histórico de buscas','history','clock','button outline')}</div>`)}<div class="work-topline"><div class="searchbox">${icon('search',18)}<input id="job-search" placeholder="Buscar por empresa ou cargo" aria-label="Buscar oportunidades" value="${escapeHTML(state.jobSearch)}"></div><span class="count-note" role="status" aria-live="polite">${filtered.length} ${filtered.length===1?'oportunidade':'oportunidades'}</span></div><div class="filter-bar" role="group" aria-label="Filtrar vagas">${filters.map(([key,label])=>`<button class="filter ${state.jobFilter===key?'selected':''}" aria-pressed="${state.jobFilter===key}" data-action="job-filter" data-filter="${key}">${label}${key==='pending_review'&&state.counts.pending_review?` <span>${state.counts.pending_review}</span>`:''}</button>`).join('')}</div><section class="panel job-table"><div class="table-heading"><span>OPORTUNIDADE</span><span>STATUS</span><span></span></div>${jobResultsMarkup(filtered)}</section><p class="help-text">Use × para descartar uma vaga e a lixeira para excluí-la do histórico. Revise a candidatura antes de aprovar. Candidaturas por e-mail podem ser enviadas imediatamente pelo Gmail conectado.</p>`;
}

const mailDate = value => {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', {
    day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'
  }).format(date) : '';
};
function updateMailBadge() {
  const badge = $('#nav-mail-unread');
  if (!badge) return;
  const unread = Number(state.mailStatus?.unread || 0);
  badge.textContent = unread;
  badge.hidden = unread === 0;
}
function renderMailIfVisible() {
  updateMailBadge();
  if (state.view === 'correio' && state.hub && !editingInProgress()) render();
}
let mailRequestId = 0;
let mailAuthAttemptId = 0;
let mailThreadRequestId = 0;
async function refreshMail({inbox=false}={}) {
  const requestId = ++mailRequestId;
  const authAttemptId = mailAuthAttemptId;
  try {
    const status = await api('/api/mail/status');
    if (requestId !== mailRequestId || authAttemptId !== mailAuthAttemptId) return;
    state.mailStatus = status;
    state.mailError = status.error || (status.connected ? '' : state.mailError);
    if (!state.mailConnecting) state.mailConnecting = Boolean(status.connecting);
    state.mailLoading = Boolean(inbox && status.connected);
    if (!status.connected) { state.mailThreads = []; state.mailThread = null; }
    renderMailIfVisible();
    if (inbox && status.connected) {
      const result = await api('/api/mail/inbox');
      if (requestId !== mailRequestId || authAttemptId !== mailAuthAttemptId) return;
      state.mailThreads = result.threads || [];
    }
  } catch (error) {
    if (requestId === mailRequestId && authAttemptId === mailAuthAttemptId) state.mailError = error.message;
    throw error;
  } finally {
    if (requestId === mailRequestId) {
      state.mailLoading = false;
      renderMailIfVisible();
    }
  }
}
async function connectMail() {
  if (state.mailConnecting || state.mailCancelling) return;
  const attemptId = ++mailAuthAttemptId;
  state.mailConnecting = true;
  state.mailCancelling = false;
  state.mailError = '';
  renderMailIfVisible();
  try {
    const result = await api('/api/mail/connect', {});
    if (attemptId !== mailAuthAttemptId) return;
    state.mailStatus = result.status;
    state.mailConnecting = false;
    state.mailError = result.status?.error || '';
    renderMailIfVisible();
    try {
      await api('/api/mail/sync', {});
      if (attemptId !== mailAuthAttemptId) return;
      await refreshMail({ inbox:true });
      if (attemptId !== mailAuthAttemptId) return;
      await load({ silent:true });
      if (attemptId !== mailAuthAttemptId) return;
      toast('Gmail conectado. Candidaturas aprovadas sincronizadas.');
    } catch (error) {
      if (attemptId !== mailAuthAttemptId) return;
      state.mailError = `Gmail conectado, mas não foi possível sincronizar. ${error.message}`;
      renderMailIfVisible();
    }
  } catch (error) {
    if (attemptId !== mailAuthAttemptId) return;
    state.mailError = error.message || 'Não foi possível conectar ao Gmail. Tente novamente.';
    try {
      const status = await api('/api/mail/status');
      if (attemptId !== mailAuthAttemptId) return;
      state.mailStatus = status;
      if (status.error) state.mailError = status.error;
      state.mailConnecting = Boolean(status.connecting);
    } catch {}
  } finally {
    if (attemptId === mailAuthAttemptId) {
      state.mailConnecting = Boolean(state.mailStatus?.connecting);
      state.mailCancelling = false;
      renderMailIfVisible();
    }
  }
}
async function cancelMailConnect() {
  if (!state.mailConnecting || state.mailCancelling) return;
  const attemptId = ++mailAuthAttemptId;
  state.mailCancelling = true;
  state.mailError = '';
  renderMailIfVisible();
  try {
    const result = await api('/api/mail/connect/cancel', {});
    if (attemptId !== mailAuthAttemptId) return;
    const status = result.status || {};
    state.mailStatus = status;
    state.mailConnecting = Boolean(status.connecting);
    state.mailCancelling = false;
    state.mailError = status.connected ? '' : (status.error || 'Autorização cancelada. Você pode tentar novamente.');
    renderMailIfVisible();
    if (status.connected) toast('Gmail conectado.');
  } catch (error) {
    if (attemptId !== mailAuthAttemptId) return;
    state.mailCancelling = false;
    let statusError = '';
    try {
      const status = await api('/api/mail/status');
      if (attemptId !== mailAuthAttemptId) return;
      state.mailStatus = status;
      state.mailConnecting = Boolean(status.connecting);
      statusError = status.error || '';
    } catch {}
    state.mailError = `Não foi possível cancelar a autorização. ${statusError || error.message}`;
    renderMailIfVisible();
  }
}
async function openMailThread(id) {
  const requestId = ++mailThreadRequestId;
  state.mailThreadLoading = true;
  renderMailIfVisible();
  try {
  const result = await api(`/api/mail/threads/${encodeURIComponent(id)}`);
  if (requestId !== mailThreadRequestId) return;
  state.mailThread = result.thread;
  state.mailDraft = '';
  const status = await api('/api/mail/status');
  if (requestId === mailThreadRequestId) state.mailStatus = status;
  } finally {
    if (requestId === mailThreadRequestId) {
      state.mailThreadLoading = false;
      renderMailIfVisible();
    }
  }
}
function mailView() {
  const status = state.mailStatus;
  const connected = Boolean(status?.connected);
  const pending = Number(status?.pending || 0);
  const unread = Number(status?.unread || 0);
  const pendingAlerts = Number(status?.alerts?.pending || 0);
  const uncertainAlerts = Number(status?.alerts?.uncertain || 0);
  const failedAlerts = Number(status?.alerts?.failed || 0);
  const linked = status?.linked || [];
  const threads = state.mailThreads.filter(thread => {
    const search = state.mailSearch.trim().toLowerCase();
    return !search || `${thread.subject} ${thread.snippet} ${thread.messages?.at(-1)?.from || ''}`.toLowerCase().includes(search);
  });
  const thread = state.mailThread;
  const selected = thread?.id || '';
  const tracked = id => linked.find(item => item.threadId === id);
  const threadList = threads.map(item => {
    const relation = tracked(item.id);
    const last = item.messages?.at(-1);
    return `<button type="button" class="mail-thread-row ${selected===item.id?'is-selected':''} ${relation?.unread?'is-unread':''}" data-action="mail-open-thread" data-id="${escapeHTML(item.id)}">
      <span class="mail-thread-avatar">${escapeHTML((relation?.company || last?.from || '?').slice(0,1).toUpperCase())}</span>
      <span class="mail-thread-info"><span class="mail-thread-title">${text(relation?.company || last?.from || 'Remetente')}</span><strong>${text(item.subject || '(sem assunto)')}</strong><small>${text(item.snippet || last?.body || '')}</small></span>
      <span class="mail-thread-meta">${mailDate(item.updatedAt)}${relation?.unread?'<i aria-label="Resposta não lida"></i>':''}</span>
    </button>`;
  }).join('');
  const conversation = thread ? `<section class="mail-conversation" aria-label="Conversa selecionada">
      <div class="mail-conversation-top"><div><span class="mail-kicker">CONVERSA</span><h2>${text(thread.subject || '(sem assunto)')}</h2>${tracked(thread.id)?`<p>${text(tracked(thread.id).company)} · ${text(tracked(thread.id).title)}</p>`:''}</div><button type="button" class="button outline" data-action="mail-close-thread">${icon('close',15)} Fechar</button></div>
      <div class="mail-message-stack">${(thread.messages||[]).map(message=>`<article class="mail-message"><div class="mail-message-heading"><div><strong>${text(message.from)}</strong><small>Para ${text(message.to)}</small></div><time>${mailDate(message.date)}</time></div><div class="mail-message-body">${text(message.body)}</div></article>`).join('')}</div>
      <form data-form="mail-reply" data-id="${escapeHTML(thread.id)}" class="mail-reply"><label class="form-field"><span>Responder nesta conversa</span><textarea name="message" maxlength="16000" rows="5" required placeholder="Escreva sua resposta...">${escapeHTML(state.mailDraft)}</textarea></label><div class="mail-reply-foot"><small>Enviado por ${text(status?.email || 'sua conta Gmail')} após você clicar em enviar.</small><button type="submit" class="button primary">${icon('arrow',15)} Enviar resposta</button></div></form>
    </section>` : `<section class="mail-conversation mail-placeholder">${icon('inbox',28)}<h2>Selecione uma conversa</h2><p>Leia as mensagens e responda aos recrutadores aqui no Kito.</p></section>`;

  return `${pageHeading('Correio','Candidaturas, respostas e conversas em um só lugar.',connected?button('Sincronizar agora','mail-sync','refresh','button outline'):'')}
    <section class="mail-summary" aria-label="Situação das candidaturas"><div><span>CONTA DE ENVIO</span><strong>${text(status?.email || 'Nenhuma conta conectada')}</strong><small><i class="mail-indicator ${connected?'is-on':''}"></i> ${connected?'Gmail conectado':state.mailCancelling?'Cancelando autorização...':state.mailConnecting?'Autorização em andamento':'Aguardando conexão'}</small></div><div><span>AGUARDANDO ENVIO</span><strong>${pending}</strong><small>Já aprovadas por e-mail</small></div><div><span>RESPOSTAS NOVAS</span><strong>${unread}</strong><small>De recrutadores acompanhados</small></div></section>
    ${state.mailError?`<div class="mail-alert" role="alert">${icon('shield',17)}<span>${text(state.mailError)}</span></div>`:''}
    ${pendingAlerts || uncertainAlerts || failedAlerts ? `<div class="mail-alert" role="status">${icon('inbox',17)}<span>${pendingAlerts ? `${pendingAlerts} ${pendingAlerts===1?'aviso de vaga aguardando envio':'avisos de vagas aguardando envio'}. ` : ''}${uncertainAlerts ? `${uncertainAlerts} ${uncertainAlerts===1?'aviso aguardando confirmação do Gmail':'avisos aguardando confirmação do Gmail'}. ` : ''}${failedAlerts ? `${failedAlerts} ${failedAlerts===1?'aviso não enviado':'avisos não enviados'} (verifique a conexão).` : ''}</span></div>` : ''}
    ${!status?`<section class="panel mail-setup"><h2>Carregando Gmail...</h2><p>Consultando o estado da conexão.</p></section>`:!connected?`<section class="panel mail-setup"><span class="mail-kicker">GMAIL · GOOGLE OAUTH</span><h2>Conecte seu e-mail de trabalho</h2><p>Autorize ${text(status.email || 'sua conta Gmail')} para enviar candidaturas aprovadas, acompanhar respostas e responder diretamente pelo aplicativo.</p>
      ${!status.configured
        ? `<form data-form="mail-configure" class="mail-config-form"><label class="form-field"><span>Client ID do Google OAuth (aplicativo para computador)</span><input type="text" name="clientId" placeholder="123456789-xxxxx.apps.googleusercontent.com" required autocomplete="off" spellcheck="false" maxlength="220"></label><label class="form-field"><span>Client Secret do Google OAuth</span><input type="password" name="clientSecret" placeholder="Cole o Client Secret gerado pelo Google" required autocomplete="new-password" spellcheck="false" maxlength="512"></label><button type="submit" class="button primary">${icon('check',16)} Salvar credenciais</button></form>`
        : !status.credentialsReady
          ? `<form data-form="mail-configure" class="mail-config-form"><p>O Client ID já está salvo. Informe o Client Secret correspondente para concluir a configuração.</p><label class="form-field"><span>Client Secret do Google OAuth</span><input type="password" name="clientSecret" placeholder="Cole o Client Secret gerado pelo Google" required autocomplete="new-password" spellcheck="false" maxlength="512"></label><button type="submit" class="button primary">${icon('check',16)} Salvar Client Secret</button></form>`
          : `<div class="mail-connect-actions"><button type="button" class="button primary" data-action="mail-connect" ${state.mailConnecting || state.mailCancelling?'disabled':''}>${icon('link',16)} ${state.mailConnecting?'Aguardando autorização...':'Conectar Gmail'}</button>${state.mailConnecting?`<button type="button" class="button outline" data-action="mail-connect-cancel" ${state.mailCancelling?'disabled':''}>${state.mailCancelling?'Cancelando...':'Cancelar'}</button>`:''}</div><details class="mail-change-config"><summary>Alterar credenciais OAuth</summary><form data-form="mail-configure" class="mail-config-form"><label class="form-field"><span>Novo Client ID (opcional)</span><input type="text" name="clientId" autocomplete="off" spellcheck="false" maxlength="220" placeholder="Deixe vazio para manter o atual"></label><label class="form-field"><span>Client Secret</span><input type="password" name="clientSecret" placeholder="Informe o novo Client Secret" required autocomplete="new-password" spellcheck="false" maxlength="512"></label><button type="submit" class="button outline">Atualizar credenciais</button></form></details>`
      }      <p class="mail-setup-guide">No Google Cloud, ative a Gmail API, configure a tela de consentimento OAuth e crie um ID OAuth do tipo <strong>Aplicativo para computador</strong>. O Google gera um Client ID e um Client Secret para esse cliente. Informe os dois campos. O segredo fica protegido pelo armazenamento criptografado do Windows. Se o projeto estiver em modo de teste, inclua ${text(status.email || 'sua conta Gmail')} como usuário de teste.</p></section>`:`<div class="mail-connected-bar"><div>${icon('check',17)} <span>Conta autorizada. As candidaturas aprovadas por e-mail são processadas automaticamente.</span></div><button type="button" data-action="mail-disconnect" class="button subtle">Desconectar</button></div>
      ${linked.length?`<section class="panel mail-tracked"><div class="card-heading"><h2>Conversas de candidaturas</h2><span class="tiny-note">${linked.length} acompanhadas</span></div><div class="mail-tracked-list">${linked.map(link=>`<button type="button" class="mail-tracked-item" data-action="mail-open-thread" data-id="${escapeHTML(link.threadId)}"><span><strong>${text(link.company)}</strong><small>${text(link.title)}</small></span>${link.unread?'<span class="mail-new-label">Nova resposta</span>':icon('chevron',16)}</button>`).join('')}</div></section>`:''}
      <section class="mail-layout"><div class="panel mail-inbox"><div class="card-heading"><h2>Caixa de entrada</h2>${state.mailLoading?'<span class="tiny-note">Atualizando...</span>':`<span class="tiny-note">${state.mailThreads.length} conversas</span>`}</div><div class="searchbox mail-search">${icon('search',17)}<input id="mail-search" type="search" aria-label="Pesquisar mensagens" placeholder="Buscar na caixa de entrada" value="${escapeHTML(state.mailSearch)}"></div><div class="mail-thread-list">${threadList || `<div class="mail-list-empty">${state.mailLoading?'Buscando mensagens...':'Nenhuma conversa encontrada.'}</div>`}</div></div>${conversation}</section>`}
  `;
}
function tasksView(){
  const tasks=state.hub.tasks;
  const open=tasks.filter(t=>!t.done);
  const today=localDay();
  const groups=[
    ['Hoje',open.filter(t=>t.due_date && t.due_date.slice(0,10)<=today)],
    ['Próximas',open.filter(t=>!t.due_date || t.due_date.slice(0,10)>today)],
    ['Concluídas',tasks.filter(t=>t.done)]
  ];
  return `${pageHeading('Tarefas','Seu ritmo, suas prioridades.',button('Nova tarefa','add-task'))}
    <div class="list-summary"><span><strong>${open.length}</strong> em aberto</span><span><strong>${tasks.length-open.length}</strong> concluídas</span></div>
    ${tasks.length?groups.map(([title,items])=>`<section class="panel content-panel task-group">${cardHeading(title,note(`${items.length} ${items.length===1?'tarefa':'tarefas'}`))}<div class="task-list expanded">${items.length?items.map(t=>taskRow(t)).join(''):'<p class="task-group-empty">Nenhuma tarefa nesta seção.</p>'}</div></section>`).join(''):
      `<section class="panel content-panel">${empty('Tudo livre por aqui','Crie uma tarefa para começar a organizar seu dia.','add-task','Criar primeira tarefa')}</section>`}`;
}
function routineView(){const rs=state.hub.routines,done=rs.filter(r=>r.done).length;return `${pageHeading('Rotina','Marque suas atividades conforme o dia acontece.',button('Nova atividade','add-routine'))}<section class="routine-summary"><div><span>HOJE · ${fmtDate(localDay()).toUpperCase()}</span><strong>${rs.length?`${done} / ${rs.length}`:'—'}</strong><p>${rs.length?'atividades concluídas':'Sua rotina começa aqui'}</p></div><div class="routine-graphic"><progress class="progress-meter" value="${percent(done,rs.length)}" max="100" aria-label="Progresso da rotina de hoje"></progress><span>${percent(done,rs.length)}% do dia</span></div></section><section class="panel content-panel">${cardHeading('Atividades de hoje',note('Reinicia a cada dia'))}<div class="task-list expanded">${rs.length?rs.map(r=>routineRow(r)).join(''):empty('Ainda sem rotina','Adicione atividades com horários para acompanhar diariamente.','add-routine','Adicionar atividade')}</div></section>`;}
function transactionRow(t){return `<div class="transaction-row"><span class="transaction-symbol ${t.type}">${icon(t.type==='income'?'arrow':'wallet',17)}</span><div class="transaction-name"><strong>${text(t.description)}</strong><small>${text(t.category)} · ${fmtDate(t.occurred_on)}</small></div><strong class="transaction-value ${t.type}">${t.type==='income'?'+':'−'} ${displayMoney(t.amount_cents)}</strong><button class="quiet-icon" aria-label="Excluir lançamento ${escapeHTML(t.description)}" data-action="delete-transaction" data-id="${t.id}">${icon('trash',16)}</button></div>`;}
const bankCategories = ['Alimentação', 'Entretenimento', 'Assinaturas e serviços', 'Moradia',
  'Transporte', 'Saúde', 'Educação', 'Compras', 'Tributos e taxas', 'Outras', 'Transferências'];
const financeMonth = () => state.banking?.insights?.month || localDay().slice(0, 7);
const monthLabel = month => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
  .format(new Date(`${month}-01T12:00:00`));
const bankCategoryOptions = selected => bankCategories.map(category =>
  `<option value="${escapeHTML(category)}" ${category===selected?'selected':''}>${escapeHTML(category)}</option>`).join('');
const bankFold = (key, title, subtitle, content) => `
  <details class="panel bank-fold" data-bank-section="${key}" ${state.bankExpanded[key]?'open':''}>
    <summary class="bank-fold-header">
      <span class="bank-fold-label"><strong>${title}</strong><small>${subtitle}</small></span>
      <span class="bank-fold-chevron">${icon('chevron',18)}</span>
    </summary>
    <div class="bank-fold-content">${content}</div>
  </details>`;

function bankTransactionRow(t){
  const expense=t.account_type==='CREDIT'?t.amount_cents>0:t.amount_cents<0;
  const direction=expense?'expense':'income';
  const category=t.category_label||t.category_override||t.category||'Outras';
  return `<div class="transaction-row bank-transaction">
    <span class="transaction-symbol ${direction}">${icon(expense?'wallet':'arrow',17)}</span>
    <div class="transaction-name">
      <strong title="${escapeHTML(t.description)}">${text(t.description)}</strong>
      <small>${text(t.institution)} · ${text(t.account_name)} · ${fmtDate(t.occurred_on)}</small>
      <span class="bank-category-label">${text(category)}${t.category_override?' · ajustada':''}</span>
    </div>
    <strong class="transaction-value ${direction}">${expense?'−':'+'} ${displayBankMoney(Math.abs(t.amount_cents),t.currency)}</strong>
    <button type="button" class="quiet-icon bank-edit-category" data-action="edit-bank-category"
      data-id="${escapeHTML(t.id)}" aria-label="Alterar categoria de ${escapeHTML(t.description)}" title="Corrigir categoria">${icon('settings',15)}</button>
  </div>`;
}
function bankTransactionDirection(transaction){
  const expense=transaction.account_type==='CREDIT' ? transaction.amount_cents>0 : transaction.amount_cents<0;
  return expense?'expense':'income';
}
function normalizedBankText(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}
function filteredBankTransactions(){
  const terms=normalizedBankText(state.bankSearch.trim()).split(/\s+/).filter(Boolean);
  return (state.banking?.transactions||[]).filter(t=>{
    if(state.bankDirection!=='all' && bankTransactionDirection(t)!==state.bankDirection)return false;
    const haystack=normalizedBankText([
      t.description,t.institution,t.account_name,t.category_label,t.category_override,t.category,
      t.occurred_on,fmtDate(t.occurred_on),bankMoney(Math.abs(t.amount_cents),t.currency),
      (Number(t.amount_cents)/100).toFixed(2).replace('.',',')
    ].join(' '));
    return terms.every(term=>haystack.includes(term));
  });
}
function bankResultsMarkup(transactions){
  if(transactions.length)return transactions.map(bankTransactionRow).join('');
  return `<p class="bank-inline-empty bank-no-results">${state.bankSearch.trim()||state.bankDirection!=='all'?
    'Nenhuma movimentação corresponde à pesquisa ou ao filtro.':'Sincronize suas conexões para consultar as transações disponíveis.'}</p>`;
}
function updateBankResults(){
  const list=main.querySelector('#bank-results');
  if(!list)return;
  const filtered=filteredBankTransactions();
  list.innerHTML=bankResultsMarkup(filtered);
  const status=main.querySelector('#bank-result-count');
  if(status)status.textContent=`${filtered.length} de ${(state.banking?.transactions||[]).length} movimentações`;
}

function financeView(){
  const {finance:f,transactions:tx}=state.hub;
  const bank=state.banking||{configured:false,items:[],accounts:[],transactions:[],balanceCents:null};
  const configured=bank.configured;
  const connected=(bank.items||[]).length;
  const accounts=bank.accounts||[];
  const bankTransactions=bank.transactions||[];
  const filteredMovements=filteredBankTransactions();
  const insights=bank.insights||{month:localDay().slice(0,7),incomeCents:0,expenseCents:0,netCents:0,
    estimatedDueCents:0,importedThisMonth:0,categories:[],recurring:[]};
  const syncTimes=(bank.items||[]).map(item=>Date.parse(item.last_synced_at)).filter(Number.isFinite);
  const hasBankWarning=state.bankLoadError||state.bankSyncError||(bank.items||[]).some(item=>item.last_error||!item.last_synced_at);
  const syncMessage=state.bankLoadError?'Falha ao consultar os bancos. Os valores exibidos podem estar desatualizados.':
    state.bankSyncError?`Não foi possível atualizar os bancos. ${state.bankSyncError} Os valores exibidos podem estar desatualizados.`:
    hasBankWarning?'Algumas conexões precisam de atenção. Confira os detalhes abaixo.':
    syncTimes.length?`Dados bancários sincronizados em ${fmtTime(new Date(Math.min(...syncTimes)).toISOString())}. Use Sincronizar para importar novos lançamentos.`:
    'Aguardando a primeira sincronização das contas.';
  const bills=bank.bills||{bills:[],owedCents:0,paidCents:0};
  const month=insights.month;
  const actions=`<div class="bank-hero-actions">${button(configured?'Credenciais Pluggy':'Configurar Pluggy','add-bank-credentials','settings','button outline')}${button('Adicionar conexão','add-bank-item','plus','button outline')}${configured&&connected?button('Sincronizar','sync-bank','refresh','button primary'):''}</div>`;
  const bankCards=[
    ['Entrou no mês',insights.incomeCents,'Créditos nas contas conectadas','income'],
    ['Saiu no mês',insights.expenseCents,'Débitos e compras no cartão','expense'],
    ['Resultado do mês',insights.netCents,'Entradas menos saídas','net'],
    ['Falta pagar',bills.owedCents,'Contas cadastradas ainda em aberto','owed']
  ];
  const bankSummary=`<section class="bank-monthly-summary" aria-label="Movimentação mensal das contas">
    <div class="bank-block-heading"><h2>Este mês</h2><span>${monthLabel(month)} · ${insights.importedThisMonth} movimentações consideradas</span></div>
    <div class="bank-monthly-grid">${bankCards.map(([title,value,detail,tone])=>`
      <article class="bank-monthly-stat ${tone}"><span>${title}</span><strong>${displayMoney(value)}</strong><small>${detail}</small></article>`).join('')}</div>
    <p class="bank-disclaimer">Valores importados dos bancos em reais. Transferências identificadas e pagamentos de fatura são desconsiderados no total. A atualização depende das instituições conectadas.</p>
  </section>`;
  const billsMarkup=`<section class="panel bank-due-panel">
    <div class="bank-block-heading"><div><h2>Contas a pagar</h2><p>O total em aberto considera somente as contas que você cadastrar aqui.</p></div>
      ${button('Adicionar conta','add-finance-bill','plus','button outline')}</div>
    ${bills.bills.length?`<div class="bank-due-list">${bills.bills.map(b=>`
      <div class="bank-due-row ${b.paid?'is-paid':''}">
        <label class="bank-due-check"><input class="custom-check" type="checkbox" data-action="toggle-finance-bill"
          data-id="${b.id}" ${b.paid?'checked':''} aria-label="Marcar ${escapeHTML(b.description)} como ${b.paid?'não paga':'paga'}"></label>
        <div class="bank-due-description"><strong>${text(b.description)}</strong><small>${text(b.category)} · Vence ${fmtDate(b.due_on)}${b.repeat_monthly?' · Mensal':''}${b.paid?' · Paga':''}</small></div>
        <strong class="bank-due-amount">${displayMoney(b.amount_cents)}</strong>
        <button class="quiet-icon" data-action="delete-finance-bill" data-id="${b.id}" aria-label="Excluir conta ${escapeHTML(b.description)}" title="Excluir conta">${icon('trash',15)}</button>
      </div>`).join('')}</div>`:`<p class="bank-inline-empty">Nenhuma conta cadastrada para ${monthLabel(month)}. Adicione as contas do mês para acompanhar o que falta pagar.</p>`}
  </section>`;
  const categories=insights.categories||[];
  const maxSpent=categories[0]?.amountCents||0;
  const categoryMarkup=`<section class="panel bank-insights-panel">
    <div class="bank-block-heading"><div><h2>Para onde foi o dinheiro</h2><p>Despesas agrupadas pelas movimentações importadas em ${monthLabel(month)}.</p></div></div>
    ${categories.length?`<div class="bank-category-list">${categories.map(c=>`
      <div class="bank-category-row"><div class="bank-category-info"><span>${text(c.name)}</span><strong>${displayMoney(c.amountCents)}</strong></div>
      <progress class="bank-category-meter" value="${Math.max(0,Math.min(100,Math.round(c.amountCents/maxSpent*100)))}" max="100" aria-label="Participação de ${escapeHTML(c.name)} nas despesas"></progress></div>`).join('')}</div>`:
      `<p class="bank-inline-empty">Ainda não há despesas identificadas neste mês.</p>`}
  </section>`;
  const recurring=insights.recurring||[];
  const recurringMarkup=`<section class="panel bank-insights-panel bank-recurring-panel">
    <div class="bank-block-heading"><div><h2>Assinaturas e recorrências</h2>
      <p>Estimativas a partir de cobranças repetidas no histórico bancário.</p></div>
      <span class="bank-recurring-total">${displayMoney(insights.estimatedDueCents)} <small>previstos neste mês</small></span></div>
    ${recurring.length?`<div class="bank-recurring-list">${recurring.map(r=>`
      <div class="bank-recurring-row"><span class="bank-recurring-icon">${icon('refresh',17)}</span>
        <div><strong>${text(r.merchant)}</strong><small>${text(r.category)} · ${text(r.accountName)} · ${r.occurrences} ocorrências</small>
        <span class="bank-recurring-date">${r.paidThisMonth?'Cobrança registrada neste mês':`Próxima cobrança estimada ${fmtDate(r.nextDue)}`}</span></div>
        <strong>${displayMoney(r.estimatedCents)}<small>estimado</small></strong>
      </div>`).join('')}</div>`:
      `<p class="bank-inline-empty">Ainda não há repetições suficientes para identificar cobranças mensais. A análise usa até 180 dias de histórico.</p>`}
    <p class="bank-disclaimer">Previsões automáticas podem variar e não representam dívidas confirmadas. Cadastre seus vencimentos em “Contas a pagar”.</p>
  </section>`;
  const connections=bankFold('connections','Conexões bancárias',`${connected} ${connected===1?'instituição':'instituições'}`,
    `<div class="bank-items">${bank.items.map(item=>`<article class="bank-item">
      <div class="bank-item-symbol">${icon('wallet',20)}</div>
      <div class="bank-item-details"><strong>${text(item.institution||'Aguardando primeira sincronização')}</strong>
        <span class="bank-item-id" title="${escapeHTML(item.id)}">ID ${escapeHTML(item.id.slice(0,8))}… · ${item.last_synced_at?`Atualizado em ${fmtTime(item.last_synced_at)}`:'Ainda não sincronizado'}</span>
        ${item.last_error?`<small class="bank-error" role="status">${text(item.last_error)}</small>`:''}</div>
      <span class="bank-connection-status ${item.last_error?'bank-status-error':item.last_synced_at?'bank-status-ok':''}">${item.last_error?'Atenção':item.last_synced_at?'Sincronizado':'Pendente'}</span>
      <button type="button" class="quiet-icon" data-action="remove-bank-item" data-id="${escapeHTML(item.id)}" aria-label="Remover conexão ${escapeHTML(item.institution||item.id)}" title="Remover do aplicativo">${icon('trash',16)}</button>
    </article>`).join('')}</div>`);
  const movements=bankFold('movements','Movimentações dos bancos',`Até 200 lançamentos · últimos 180 dias`,
    `<div class="bank-search-tools">
      <label class="searchbox bank-searchbox">${icon('search',18)}<input type="search" id="bank-search"
        placeholder="Buscar descrição, banco, categoria, valor..." aria-label="Pesquisar extratos"
        value="${escapeHTML(state.bankSearch)}" autocomplete="off"></label>
      <div class="bank-search-meta"><div class="bank-direction-filters" role="group" aria-label="Filtrar movimentações">
        ${[['all','Todas'],['income','Entradas'],['expense','Saídas']].map(([key,label])=>
          `<button type="button" class="bank-direction-filter ${state.bankDirection===key?'selected':''}"
            data-action="bank-direction" data-direction="${key}" aria-pressed="${state.bankDirection===key}">${label}</button>`).join('')}
        </div><span id="bank-result-count" role="status" aria-live="polite">${filteredMovements.length} de ${bankTransactions.length} movimentações</span></div>
    </div>
    <div id="bank-results" class="transaction-list">${bankResultsMarkup(filteredMovements)}</div>`);
  return `${pageHeading('Finanças','Fluxo mensal, vencimentos e contas conectadas.',`<div class="page-actions">${balanceButton()}${button('Novo lançamento','add-finance')}</div>`)}
    <section class="panel bank-hero" aria-label="Conexão Open Finance">
      <div class="bank-hero-copy"><span class="bank-eyebrow">${icon('shield',15)} OPEN FINANCE · PLUGGY</span>
        <h2>${configured?(connected?'Seus bancos, reunidos.':'Pluggy configurado. Adicione suas conexões.'):'Conecte suas contas pelo Pluggy'}</h2>
        <p>${configured?(connected?`${connected} ${connected===1?'conexão cadastrada':'conexões cadastradas'} no Kito. Atualize para importar os dados disponíveis.`:'Copie os itemIds das conexões da sua aplicação Pluggy.'):'Use o Client ID e o Client Secret da sua aplicação Pluggy para consultar suas contas no Kito.'}</p>
        ${connected?`<p class="bank-sync-message ${hasBankWarning?'has-warning':''}" role="status">${escapeHTML(syncMessage)}</p>`:''}
        ${actions}
      </div>
      <div class="bank-balance"><span>SALDO BANCÁRIO CONSOLIDADO</span><strong>${bank.balanceCents===null?'—':displayBankMoney(bank.balanceCents)}</strong><small>${bank.balanceCents===null?'Disponível após sincronizar todas as contas bancárias em reais':'Contas bancárias em BRL · não inclui cartão de crédito'}</small></div>
    </section>
    ${!connected?`<section class="panel bank-onboarding">${cardHeading('Como importar seus bancos')}
      <p>Na aplicação do <strong>Dashboard Pluggy</strong>, abra a aba <strong>Demo</strong>, conecte o serviço <strong>MeuPluggy</strong> com sua conta e copie os <strong>itemIds</strong> em “Itens Conectados”. Adicione cada itemId aqui.</p>
      <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener noreferrer" class="bank-guide-link">Abrir Dashboard Pluggy ${icon('external',15)}</a>
      ${!window.wndBank?'<p class="help-text">Na versão web, configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente do servidor e reinicie-o.</p>':''}
    </section>`:''}
    ${bankSummary}
    ${billsMarkup}
    <div class="bank-insights-grid">${categoryMarkup}${recurringMarkup}</div>
    ${connected?`${connections}
      <section class="bank-account-section" aria-label="Contas bancárias">
        <div class="bank-section-heading"><h2>Contas conectadas</h2><span>${accounts.length} ${accounts.length===1?'conta':'contas'}</span></div>
        ${accounts.length?`<div class="bank-account-grid">${accounts.map(a=>`<article class="panel bank-account">
          <div class="bank-account-top"><span>${icon(a.type==='CREDIT'?'wallet':'shield',18)} ${text(a.type==='CREDIT'?'Crédito':a.type==='BANK'?'Conta bancária':a.type||'Conta')}</span><span>${text(a.currency)}</span></div>
          <h3>${text(a.name)}</h3><strong>${displayBankMoney(a.balance_cents,a.currency)}</strong><small>${text(a.subtype||'Saldo informado pelo banco')}</small>
        </article>`).join('')}</div>`:empty('Aguardando a primeira sincronização','Suas contas aparecerão aqui depois que os dados forem importados.')}
      </section>${movements}`:''}
    <div class="bank-section-heading bank-manual-heading"><div><h2>Registros manuais</h2><p>Seu controle mensal continua independente das contas conectadas.</p></div></div>
    <div class="finance-stats"><article class="finance-stat"><span>RESULTADO DO MÊS</span><strong>${displayMoney(f.balance)}</strong><small>${monthLabel(f.month)}</small></article><article class="finance-stat"><span>ENTRADAS</span><strong>${displayMoney(f.income)}</strong><small>Recebimentos registrados</small></article><article class="finance-stat"><span>SAÍDAS</span><strong>${displayMoney(f.expense)}</strong><small>Despesas registradas</small></article></div>
    <section class="panel content-panel">${cardHeading('Últimos lançamentos manuais',note('Até 300 registros mais recentes'))}
      <div class="transaction-list">${tx.length?tx.map(transactionRow).join(''):empty('Nenhum lançamento manual','Registre uma entrada ou despesa para acompanhar seu dinheiro.','add-finance','Novo lançamento')}</div>
    </section>`;
}
const formatBytes = v=>`${(Number(v||0)/1024**3).toLocaleString('pt-BR',{maximumFractionDigits:1})} GB`;
const uptime = s=>{const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return `${d?`${d}d `:''}${h}h ${m}min`;};
function pcView(){const p=state.pc;return `${pageHeading('Meu PC','Informações locais do Windows atualizadas enquanto você usa o painel.',button('Atualizar dados','refresh','refresh','button outline'))}<div class="pc-heading"><div class="pc-icon">${icon('monitor',30)}</div><div><span>COMPUTADOR ATUAL</span><h2>${text(p?.hostname||'Não identificado')}</h2><p>${p?.platform==='win32'?'Windows':text(p?.platform)} · ${text(p?.release)}</p></div><span class="pc-connected"><span></span>Conectado</span></div><div class="pc-stats"><section class="panel pc-stat"><div class="metric-icon">${icon('cpu',21)}</div><span>USO DA CPU</span><strong data-pc-value="detail-cpu">${p?.cpu_percent===null?'Calculando...':`${p?.cpu_percent??0}%`}</strong><progress data-pc-meter="detail-cpu" class="progress-meter" value="${p?.cpu_percent||0}" max="100" aria-label="Uso atual da CPU"></progress><small>${text(p?.cpu||'—')}</small></section><section class="panel pc-stat"><div class="metric-icon">${icon('activity',21)}</div><span>MEMÓRIA RAM</span><strong data-pc-value="detail-memory">${p?.memory_percent??0}%</strong><progress data-pc-meter="detail-memory" class="progress-meter" value="${p?.memory_percent||0}" max="100" aria-label="Uso atual da RAM"></progress><small data-pc-value="detail-ram-usage">${formatBytes(p?.memory_used)} de ${formatBytes(p?.memory_total)}</small></section><section class="panel pc-stat"><div class="metric-icon">${icon('clock',21)}</div><span>TEMPO LIGADO</span><strong class="pc-uptime" data-pc-value="detail-uptime">${uptime(p?.uptime||0)}</strong><progress class="progress-meter muted" value="100" max="100" aria-label="Indicador de tempo ligado"></progress><small>Desde a última inicialização do sistema</small></section></div><section class="panel pc-specs">${cardHeading('Detalhes do sistema')}<div class="spec-row"><span>Processador</span><strong>${text(p?.cpu)}</strong></div><div class="spec-row"><span>Processadores lógicos</span><strong>${p?.cores??'—'}</strong></div><div class="spec-row"><span>Memória total</span><strong>${formatBytes(p?.memory_total)}</strong></div><div class="spec-row"><span>Última atualização</span><strong data-pc-value="detail-updated">${fmtTime(p?.updated_at)}</strong></div></section><p class="help-text">Essas métricas são fornecidas pelo Windows e Node.js; o painel não altera configurações do PC.</p>`;}
function shortcutsView(){const links=state.hub.shortcuts;return `${pageHeading('Atalhos','Seus links mais usados, reunidos num só lugar.',button('Adicionar atalho','add-shortcut'))}<div class="shortcut-grid">${links.length?links.map(s=>`<article class="shortcut-card"><div class="shortcut-symbol">${icon('link',24)}</div><div><h2>${text(s.label)}</h2><p>${text(new URL(s.url).hostname)}</p></div><div class="shortcut-actions"><a href="${escapeHTML(s.url)}" class="button outline" target="_blank" rel="noopener noreferrer">Abrir ${icon('external',15)}</a><button class="quiet-icon" data-action="delete-shortcut" data-id="${s.id}" aria-label="Excluir atalho ${escapeHTML(s.label)}">${icon('trash',17)}</button></div></article>`).join(''):`<div class="panel">${empty('Nenhum atalho ainda','Adicione os sites e ferramentas que usa com frequência.','add-shortcut','Criar atalho')}</div>`}</div>`;}
function layoutColumnMarkup(column,title,description){
  const keys=currentOverviewLayout()[column];
  const destination=column==='main'?'lateral':'principal';
  return `<section class="layout-column" aria-label="${title}"><div class="layout-column-title"><strong>${title}</strong><small>${description}</small></div>
  <div class="layout-items">${keys.length?keys.map((key,index)=>`<div class="layout-item" data-layout-card="${key}"><span class="layout-grip" aria-hidden="true">::</span><span class="layout-item-name">${overviewCardLabels[key]}</span><div class="layout-controls">
  <button type="button" data-action="move-overview-card" data-card="${key}" data-move="up" aria-label="Subir ${overviewCardLabels[key]}" title="Subir" ${index===0?'disabled':''}>↑</button>
  <button type="button" data-action="move-overview-card" data-card="${key}" data-move="down" aria-label="Descer ${overviewCardLabels[key]}" title="Descer" ${index===keys.length-1?'disabled':''}>↓</button>
  <button type="button" data-action="move-overview-card" data-card="${key}" data-move="switch" aria-label="Mover ${overviewCardLabels[key]} para coluna ${destination}" title="Mover para coluna ${destination}">⇄</button></div></div>`).join(''):`<p class="layout-empty">Coluna vazia. Mova um card para cá.</p>`}</div></section>`;
}
function settingsView(){
  const modules=state.hub.modules;
  const startup=state.startup;
  const startupSupported=Boolean(startup?.supported);
  const prefs=state.hub.job_preferences;
  return `${pageHeading('Configurações','Ajuste o Kito ao seu jeito de trabalhar.')}
  <section class="panel settings-panel">${cardHeading('Automação em segundo plano')}
    <p class="panel-description">Com o Kito aberto na bandeja, as candidaturas aprovadas por e-mail são enviadas e as respostas dos recrutadores são verificadas automaticamente.</p>
    <div class="settings-list"><label class="settings-row"><span><strong>Iniciar com o Windows</strong><small>${startupSupported?'Abrir em segundo plano, sem janela ou terminal.':'Disponível na versão instalada do aplicativo para Windows.'}</small></span><input type="checkbox" class="switch-input" data-action="toggle-startup" ${startup?.enabled?'checked':''} ${startupSupported?'':'disabled'}><span class="switch-ui" aria-hidden="true"></span></label></div>
    ${state.startupError?`<p class="panel-description" role="alert">${text(state.startupError)}</p>`:''}
  </section>
  <section class="panel settings-panel job-preferences-panel">
    ${cardHeading('Preferências de vagas')}
    <p class="panel-description">Personalize a triagem de novas oportunidades importadas. Alterar estes critérios não remove vagas existentes.</p>
    <form data-form="job-preferences" class="job-preferences-form">
      <div class="job-preferences-grid">
        <label class="form-field"><span>Áreas e palavras-chave</span><textarea name="keywords" rows="2" maxlength="750" placeholder="Ex.: design, desenvolvimento, marketing">${escapeHTML(prefs.keywords)}</textarea><small>Separe os termos por vírgula. Deixe vazio para considerar qualquer área.</small></label>
        <label class="form-field"><span>Termos a evitar</span><textarea name="excluded_terms" rows="2" maxlength="750" placeholder="Ex.: vendas, atendimento">${escapeHTML(prefs.excluded_terms)}</textarea><small>Vagas com esses termos serão ignoradas.</small></label>
        <label class="form-field"><span>Cidades ou regiões aceitas</span><input type="text" name="localities" maxlength="750" value="${escapeHTML(prefs.localities)}" placeholder="Ex.: Recife, Pernambuco"><small>Deixe vazio para aceitar oportunidades de qualquer região.</small></label>
        <label class="form-field"><span>Pontuação mínima</span><input type="number" name="min_score" min="0" max="100" step="1" required value="${prefs.min_score}"><small>Entre 0 e 100. Um valor menor permite mais resultados.</small></label>
      </div>
      <div class="job-preferences-toggles">
        <label><input type="checkbox" name="remote_only" ${prefs.remote_only?'checked':''}><span>Somente vagas remotas</span></label>
        <label><input type="checkbox" name="exclude_senior" ${prefs.exclude_senior?'checked':''}><span>Ignorar cargos seniores e de liderança</span></label>
        <label><input type="checkbox" name="exclude_unpaid" ${prefs.exclude_unpaid?'checked':''}><span>Ignorar oportunidades sem remuneração</span></label>
      </div>
      <div class="job-preferences-footer"><span>Os critérios são aplicados na próxima importação.</span><button type="submit" class="button primary">${icon('check',16)} Salvar preferências</button></div>
    </form>
  </section>
  <section class="panel settings-panel layout-settings">
    <div class="card-heading"><h2>Organizar visão geral</h2><button type="button" class="layout-reset" data-action="reset-overview-layout">Restaurar padrão</button></div>
    <p class="panel-description">Defina a ordem e a coluna dos cards. Use as setas para subir ou descer e ⇄ para trocar de coluna. As alterações são salvas automaticamente.</p>
    <div class="layout-editor">${layoutColumnMarkup('main','Coluna principal','Área mais larga')}${layoutColumnMarkup('aside','Coluna lateral','Resumo e informações rápidas')}</div>
  </section>
  <section class="panel settings-panel">${cardHeading('Módulos do Kito')}<p class="panel-description">Ative ou oculte os módulos do menu. Seus dados são preservados.</p><div class="settings-list">${Object.entries(moduleLabels).map(([key,label])=>`<label class="settings-row"><span><strong>${label}</strong><small>${({tasks:'Listas e prioridades',routine:'Hábitos e atividades diárias',finance:'Entradas, despesas e saldo mensal',pc:'Informações do computador',shortcuts:'Links frequentes'})[key]}</small></span><input type="checkbox" class="switch-input" data-action="toggle-module" data-module-name="${key}" ${modules[key]?'checked':''}><span class="switch-ui" aria-hidden="true"></span></label>`).join('')}</div></section>
  <section class="panel settings-panel settings-about">${cardHeading('Sobre o Kito')}<div class="spec-row"><span>Armazenamento</span><strong>SQLite · local</strong></div><div class="spec-row"><span>Privacidade</span><strong>Seus dados ficam neste computador</strong></div><div class="spec-row"><span>Versão</span><strong>1.0.4</strong></div></section>`;
}

function spacesView(){
  const spaces=state.hub.spaces;
  return `${pageHeading('Espaços','Crie áreas de trabalho para organizar qualquer assunto.',button('Novo espaço','add-space'))}
  <div class="spaces-grid">${spaces.map(s=>`<a class="space-card" href="#space-${s.id}" data-view="space-${s.id}"><div class="space-card-icon">${icon('overview',22)}</div><div><h2>${text(s.title)}</h2><p>${text(s.description||'Seu espaço personalizado')}</p></div><div class="space-card-bottom"><span>${s.items.length} ${s.items.length===1?'bloco':'blocos'}</span><span>${icon('arrow',18)}</span></div></a>`).join('')}
  <button class="space-card space-card-create" data-action="add-space"><span class="space-card-icon">${icon('plus',22)}</span><strong>Criar outro espaço</strong><span>Notas, checklists e links para o que você precisar.</span></button></div>`;
}
function spaceView(s){
  const stats=s.items.filter(i=>i.kind==='check'),done=stats.filter(i=>i.done).length;
  const itemMarkup=i=>`<article class="space-block ${i.kind==='check'&&i.done?'completed':''}"><div class="space-block-top"><span class="block-kind">${icon(i.kind==='link'?'link':i.kind==='check'?'check':'inbox',15)}${{note:'NOTA',check:'CHECKLIST',link:'LINK'}[i.kind]}</span><button class="quiet-icon" data-action="delete-space-item" data-id="${i.id}" data-space="${s.id}" aria-label="Excluir bloco ${escapeHTML(i.title)}">${icon('trash',16)}</button></div>
  ${i.kind==='check'?`<label class="space-checkbox"><input class="custom-check" type="checkbox" data-action="toggle-space-item" data-id="${i.id}" data-space="${s.id}" ${i.done?'checked':''}><strong>${text(i.title)}</strong></label>`:`<h2>${text(i.title)}</h2>`}
  ${i.content?`<p>${text(i.content)}</p>`:''}
  ${i.kind==='link'?`<a class="space-external" target="_blank" rel="noopener noreferrer" href="${escapeHTML(i.url)}">Abrir link ${icon('external',15)}</a>`:''}</article>`;
  return `<div class="space-back"><a href="#spaces" data-view="spaces">${icon('arrow',15)} Todos os espaços</a></div>${pageHeading(text(s.title),text(s.description||'Um espaço para organizar suas ideias.'),button('Adicionar bloco','add-space-item'))}
  <section class="space-toolbar"><span>${s.items.length} blocos</span>${stats.length?`<span>${done} de ${stats.length} itens concluídos</span>`:''}<div class="space-toolbar-actions"><button data-action="edit-space" class="button outline">${icon('settings',16)} Editar</button><button data-action="delete-space" class="button danger-text">${icon('trash',15)} Excluir</button></div></section>
  <div class="space-block-grid">${s.items.map(itemMarkup).join('')}</div>
  ${!s.items.length?empty('Comece pelo primeiro bloco','Adicione uma nota, checklist ou link.','add-space-item','Adicionar bloco'):`<button class="space-add-bottom" data-action="add-space-item">${icon('plus',18)} Adicionar outro bloco</button>`}`;
}

let toastTimer;
function toast(message,type='success',undo=null) {
  const el=$('#toast');
  el.replaceChildren(document.createTextNode(message));
  if (undo) {
    const action=document.createElement('button');
    action.type='button';
    action.className='toast-action';
    action.textContent=undo.label;
    action.addEventListener('click',()=>{clearTimeout(toastTimer);el.classList.remove('visible');undo.onClick();},{once:true});
    el.append(action);
  }
  el.dataset.type=type;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('visible'),undo?6500:4500);
}
let focusBeforeDialog=null;
function closeDialog(){if(dialogBackdrop.hidden)return;dialogBackdrop.hidden=true;document.body.classList.remove('dialog-open');$('#dialog-body').innerHTML='';if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus();focusBeforeDialog=null;}
function openDialog(title,subtitle,html){focusBeforeDialog=document.activeElement;$('#dialog-title').textContent=title;$('#dialog-label').textContent=subtitle;$('#dialog-body').innerHTML=html;dialogBackdrop.hidden=false;document.body.classList.add('dialog-open');($('#dialog-body').querySelector('input:not([type=hidden]),textarea,button')||$('#close-dialog')).focus();}
const field = (label,name,placeholder='',type='text',required=false,attrs='')=>`<label class="form-field"><span>${label}</span><input name="${name}" type="${type}" placeholder="${placeholder}" ${required?'required':''} ${attrs}></label>`;
const formActions = (label) => `<div class="form-actions"><button type="button" class="button outline" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">${icon('check',16)}${label}</button></div>`;
function addDialog(kind){
  let title='',content='';
  if(kind==='job'){
    title='Adicionar vaga';
    content=`${field('Cargo','title','Ex.: Designer de produto','text',true,'maxlength="200"')}
      ${field('Empresa','company','Ex.: Estúdio Criativo','text',true,'maxlength="200"')}
      ${field('Link do anúncio','source_url','https://...','url',true,'maxlength="2000"')}
      ${field('Link para candidatura (opcional)','application_url','https://...','url',false,'maxlength="2000"')}
      <div class="dialog-field-pair">${field('Local ou remoto (opcional)','location','Ex.: Remoto','text',false,'maxlength="150"')}${field('Tipo de contrato (opcional)','contract_type','Ex.: CLT, PJ, estágio','text',false,'maxlength="100"')}</div>
      ${field('Remuneração (opcional)','compensation','Ex.: R$ 4.000','text',false,'maxlength="200"')}
      <label class="form-field"><span>Descrição (opcional)</span><textarea name="description" rows="3" maxlength="12000" placeholder="Informações relevantes do anúncio"></textarea></label>
      <p class="bank-dialog-help">A vaga será salva para revisão. Confira o anúncio e os links antes de aprovar uma candidatura.</p>`;
  }
  if(kind==='task'){title='Nova tarefa';content=`${field('O que precisa fazer?','title','Ex.: Finalizar apresentação', 'text',true,'maxlength="200"')}${field('Prazo (opcional)','due_date','','date')}<label class="form-field"><span>Prioridade</span><select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baixa</option></select></label><label class="form-field"><span>Notas (opcional)</span><textarea name="notes" rows="3" placeholder="Detalhes importantes"></textarea></label>`;}
  if(kind==='routine'){title='Nova atividade';content=`${field('Atividade','title','Ex.: Caminhada','text',true,'maxlength="200"')}${field('Horário (opcional)','time','','time')}`;}
  if(kind==='finance'){title='Novo lançamento';content=`<label class="form-field"><span>Tipo</span><select name="type"><option value="expense">Despesa</option><option value="income">Entrada</option></select></label>${field('Descrição','description','Ex.: Projeto freelance','text',true,'maxlength="200"')}${field('Valor (R$)','amount','0,00','text',true,'inputmode="decimal"')}${field('Categoria','category','Ex.: Trabalho, alimentação','text',false,'maxlength="90"')}${field('Data','occurred_on','','date',true,`value="${localDay()}"`)}`;}
  if(kind==='finance-bill'){
    title='Adicionar conta a pagar';
    content=`${field('Descrição','description','Ex.: Internet, aluguel, mensalidade','text',true,'maxlength="200"')}
      ${field('Valor (R$)','amount','0,00','text',true,'inputmode="decimal"')}
      <label class="form-field"><span>Categoria</span><select name="category">${bankCategoryOptions('Outras')}</select></label>
      ${field('Vencimento','due_on','','date',true,`value="${localDay()}"`)}
      <label class="bank-repeat-choice"><input type="checkbox" name="repeat_monthly"> Repetir todo mês</label>
      <p class="bank-dialog-help">Marque como paga após quitar a conta. Ela entrará no total em aberto até lá.</p>`;
  }
  if(kind==='bank-credentials'){
    title='Acesso à API Pluggy';
    content=window.wndBank?`<p class="bank-dialog-help">No Dashboard Pluggy, abra sua aplicação e copie as credenciais da API. Elas ficam protegidas no armazenamento do Windows.</p>${field('Client ID','clientId','Client ID da aplicação','text',true,'maxlength="200" autocomplete="off" spellcheck="false"')}${field('Client Secret','clientSecret','Client Secret da aplicação','password',true,'maxlength="500" autocomplete="new-password" spellcheck="false"')}${state.banking?.configured?'<button type="button" class="bank-clear-button" data-action="clear-bank-credentials">Excluir credenciais salvas neste computador</button>':''}`:'<p class="bank-dialog-help">No modo navegador, configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis de ambiente do servidor e reinicie-o. Abra a versão Windows para armazená-las com a proteção do sistema.</p>';
  }
  if(kind==='bank-item'){
    title='Adicionar conexão bancária';
    content=`<p class="bank-dialog-help">No Dashboard Pluggy, acesse sua aplicação → Demo → Itens Conectados. Copie o identificador da conexão desejada.</p>${field('itemId','itemId','xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx','text',true,'maxlength="36" autocomplete="off" spellcheck="false"')}`;
  }
  if(kind==='shortcut'){title='Novo atalho';content=`${field('Nome','label','Ex.: WND Portfólio','text',true,'maxlength="200"')}${field('Endereço','url','https://...','url',true)}`;}
  if(kind==='space'){title='Criar espaço';content=`${field('Nome do espaço','title','Ex.: Projetos pessoais','text',true,'maxlength="100"')}<label class="form-field"><span>Descrição (opcional)</span><textarea name="description" rows="3" maxlength="800" placeholder="O que você quer organizar aqui?"></textarea></label>`;}
  if(kind==='space-edit'){
    const s=spaceForView();if(!s)return;
    title='Editar espaço';content=`${field('Nome','title','','text',true,`maxlength="100" value="${escapeHTML(s.title)}"`)}<label class="form-field"><span>Descrição</span><textarea name="description" maxlength="800">${escapeHTML(s.description)}</textarea></label>`;
  }
  if(kind==='space-item'){
    if(!spaceForView())return;
    title='Adicionar bloco';content=`<label class="form-field"><span>Tipo de bloco</span><select name="kind" id="block-kind"><option value="note">Nota</option><option value="check">Checklist</option><option value="link">Link</option></select></label>${field('Título','title','Dê um nome ao bloco','text',true,'maxlength="180"')}<label class="form-field"><span>Descrição (opcional)</span><textarea name="content" rows="4" maxlength="12000" placeholder="Anotações e detalhes"></textarea></label><label class="form-field block-url-field" hidden><span>Link completo</span><input name="url" placeholder="https://..." type="url"></label>`;
  }
  openDialog(title,kind.startsWith('bank-')?'OPEN FINANCE':'ADICIONAR',`<form data-form="${kind}" class="dialog-form">${content}${kind==='bank-credentials'&&!window.wndBank?'<div class="form-actions"><button type="button" class="button outline" data-action="close-dialog">Fechar</button></div>':formActions('Salvar')}</form>`);
  if(kind==='space-item')$('#block-kind').dispatchEvent(new Event('change',{bubbles:true}));
}
function jobDetail(id){
  const j=state.jobs.find(j=>j.id===id);if(!j)return toast('Oportunidade não encontrada.','error');
  const editable=j.status==='pending_review';
  const canReject=['approved','needs_action','failed'].includes(j.status);
  const safeLink = raw => { try { const url=new URL(raw); return ['https:','http:'].includes(url.protocol)?url.href:''; } catch { return ''; } };
  const applicationUrl=safeLink(j.application_url || j.source_url);
  const sourceUrl=safeLink(j.source_url);
  const details=[["Empresa",j.company],["Modalidade",j.contract_type||'Não informada'],["Remuneração",j.compensation||'Não divulgada'],["Origem",j.source||'Não informada'],["Aderência estimada",Number.isInteger(j.match_score)?`${j.match_score}/100`:'Não avaliada'],["Prazo",j.deadline?fmtDate(j.deadline):'Não informado'],["Verificação",j.verified_at?`Verificada em ${fmtTime(j.verified_at)}`:'Não verificada']];
  const deleteAction=`<button type="button" class="button danger-text" data-action="delete-job" data-id="${j.id}">Excluir vaga</button>`;
  const form=editable?`<form data-form="opportunity" data-id="${j.id}" class="dialog-form job-form"><label class="form-field"><span>Apresentação personalizada</span><textarea rows="8" name="cover_letter" placeholder="Apresentação a ser revisada antes de aprovar">${escapeHTML(j.cover_letter)}</textarea></label><div class="two-fields">${field('Assunto do e-mail','subject','','text',false,`value="${escapeHTML(j.subject)}"`)}${field('Destinatário (se envio por e-mail)','recipient','','email',false,`value="${escapeHTML(j.recipient)}"`)}</div>${field('Caminho do currículo','resume_path','Caminho local do arquivo','text',false,`value="${escapeHTML(j.resume_path)}"`)}<label class="form-field"><span>Ajustes no currículo</span><textarea rows="2" name="resume_notes">${escapeHTML(j.resume_notes)}</textarea></label><div class="form-actions split-actions"><div><button type="button" class="button danger-text" data-action="reject-job" data-id="${j.id}">Rejeitar</button>${deleteAction}</div><div><button class="button outline" type="submit">Salvar alterações</button><button class="button primary" type="button" data-action="approve-job" data-id="${j.id}">${icon('check',16)} Aprovar</button></div></div></form>`:`<section class="read-only-letter"><h3>Apresentação preparada</h3><p>${j.cover_letter?escapeHTML(j.cover_letter).replaceAll('\n','<br>'):'Nenhuma apresentação cadastrada.'}</p>${j.resume_path?`<div class="spec-row"><span>Currículo</span><strong>${text(j.resume_path)}</strong></div>`:''}</section><div class="form-actions">${j.status==='approved'?button('Preparar arquivos','packet-job','download'):''}${canReject?`<button type="button" class="button danger-text" data-action="reject-job" data-id="${j.id}">Rejeitar vaga</button>`:''}${!['submitting','submitted'].includes(j.status)?deleteAction:''}<button class="button outline" data-action="close-dialog">Fechar</button></div>`;
  const links=`<div class="job-links">${sourceUrl?`<a href="${escapeHTML(sourceUrl)}" target="_blank" rel="noopener noreferrer">Anúncio original ${icon('external',14)}</a>`:''}${applicationUrl?`<a href="${escapeHTML(applicationUrl)}" target="_blank" rel="noopener noreferrer" class="${j.channel==='email'?'':'job-apply-link'}">${j.channel==='email'?'Página da oportunidade':'Candidatar-se no site'} ${icon('external',14)}</a>`:''}</div>`;
  const disclaimer=j.channel==='email'?'Após aprovação, o Gmail conectado envia a apresentação e o currículo indicado. Se estiver desconectado, a candidatura aprovada fica na fila.':'Após aprovação, use o link de inscrição para enviar sua candidatura pelo site da vaga.';
  openDialog(j.title.toString(),`${j.company} · ${statuses[j.status]}`,`<div class="job-detail-intro">${statusBadge(j.status)}${links}</div><div class="detail-grid">${details.map(([a,b])=>`<div><span>${a}</span><strong>${text(b)}</strong></div>`).join('')}</div>${j.requirements?`<section class="job-description"><h3>Requisitos</h3><p>${text(j.requirements)}</p></section>`:''}${j.match_reason?`<section class="job-description"><h3>Por que combina com você</h3><p>${text(j.match_reason)}</p></section>`:''}${j.verification_notes?`<div class="verification-note">${icon('shield',17)}${text(j.verification_notes)}</div>`:''}${j.status==='needs_action'&&applicationUrl?`<a href="${escapeHTML(applicationUrl)}" class="button primary job-apply-action" target="_blank" rel="noopener noreferrer">${icon('external',16)} Abrir inscrição</a>`:''}${form}<p class="dialog-disclaimer">${disclaimer}</p>`);
  $('#dialog').dataset.jobId=id;
}
function historyDialog(){const h=state.activity||{runs:[],events:[]};openDialog('Histórico de buscas','EXECUÇÕES',`<div class="history-block"><h3>Execuções recentes</h3>${h.runs.length?h.runs.map(r=>`<div class="history-row"><span>${fmtTime(r.started_at)}</span><strong>${r.status==='completed'?'Concluída':r.status==='running'?'Em andamento':'Falhou'}</strong><small>${r.added} novas · ${r.found} encontradas</small></div>`).join(''):'<p class="empty-small">Nenhuma execução registrada neste banco de dados.</p>'}</div><div class="history-block"><h3>Atividade das vagas</h3>${h.events.length?h.events.slice(0,12).map(r=>`<div class="history-row"><span>${fmtTime(r.created_at)}</span><strong>${text(r.type)}</strong><small>${text(r.detail)}</small></div>`).join(''):'<p class="empty-small">Sem atividades registradas.</p>'}</div>`);}

async function mutate(action, id, payload={}){await api(`/api/${action}/${id}`,payload);await load();}
async function withBusy(el, work){if(el?.disabled)return;try{if(el)el.disabled=true;await work();}catch(error){toast(error.message,'error');}finally{if(el)el.disabled=false;}}
let bankSyncInFlight=null;
let lastBankSyncAttemptAt=0;
const BANK_REFRESH_INTERVAL=60*60*1000;
const BANK_FAILURE_RETRY=5*60*1000;
function connectedBanks(){
  return state.banking?.configured && (state.banking.items||[]).length>0;
}
async function syncBanks({automatic=false}={}){
  if(bankSyncInFlight)return bankSyncInFlight;
  lastBankSyncAttemptAt=Date.now();
  bankSyncInFlight=(async()=>{
    try{
      $('#footer-sync').textContent='Sincronizando contas bancárias…';
      const result=await api('/api/banking/sync',{});
      state.bankSyncError=result.failures.length?`${result.failures.length} conexão(ões) com erro.`:null;
      await load({silent:automatic,forceRender:true});
      if(!automatic){
        if(result.failures.length)toast(`${result.synced} sincronizada(s). ${result.failures.length} conexão(ões) com erro.`, 'error');
        else toast(`${result.synced} conexão(ões) sincronizada(s).`);
      }
      return result;
    }catch(error){
      state.bankSyncError=error.message;
      await load({silent:true,forceRender:true});
      if(!automatic)throw error;
      return null;
    }finally{bankSyncInFlight=null;}
  })();
  return bankSyncInFlight;
}
async function refreshAll(){
  const bankResult=connectedBanks()?await syncBanks({automatic:true}):undefined;
  const updated=await load();
  if(!updated || bankResult===null || bankResult?.failures.length){
    toast('Atualização parcial. Confira o estado das conexões bancárias.','error');
  }else toast(bankResult?'Dados e bancos sincronizados.':'Dados locais atualizados.');
}
function editingInProgress(){
  if(!dialogBackdrop.hidden || !$('#command-backdrop').hidden)return true;
  const active=document.activeElement;
  return Boolean(active?.closest('#main-content') && active.matches('input, textarea, select, [contenteditable="true"]'));
}
async function refreshVisibleData(){
  if(document.hidden || !state.hub)return;
  if(Date.now()-lastLoadedAt>=55000)await load({silent:true});
  await refreshMail({inbox:state.view==='correio'&&!editingInProgress()}).catch(()=>{});
  if(!connectedBanks() || bankSyncInFlight)return;
  const synced=(state.banking.items||[]).map(item=>Date.parse(item.last_synced_at));
  if(!state.bankSyncError && synced.every(time=>Number.isFinite(time) && Date.now()-time<BANK_REFRESH_INTERVAL) &&
      !state.banking.items.some(item=>item.last_error))return;
  const retryDelay=state.bankSyncError || state.banking.items.some(item=>item.last_error)?BANK_FAILURE_RETRY:BANK_REFRESH_INTERVAL;
  if(Date.now()-lastBankSyncAttemptAt<retryDelay)return;
  await syncBanks({automatic:true});
}
setInterval(()=>{refreshVisibleData().catch(()=>{});},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshVisibleData().catch(()=>{});});
window.addEventListener('focus',()=>{refreshVisibleData().catch(()=>{});});
document.addEventListener('focusout',()=>{
  if(!pendingRefreshRender)return;
  setTimeout(()=>{if(pendingRefreshRender && !editingInProgress()){pendingRefreshRender=false;render();}},100);
});
document.addEventListener('click',async event=>{
  const nav=event.target.closest('a[data-view]');if(nav){event.preventDefault();navigate(nav.dataset.view,true,true);return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const {action,id}=target.dataset;
  if(action==='toggle-balance-visibility'){
    hideBalances=!hideBalances;
    localStorage.setItem('kito.hideBalances', String(hideBalances));
    render();
    return;
  }
  if(action==='mail-close-thread'){
    state.mailThread=null;state.mailDraft='';render();return;
  }
  if(action==='mail-open-thread')return withBusy(target,async()=>openMailThread(id));
  if(action==='mail-sync')return withBusy(target,async()=>{
    await api('/api/mail/sync',{});
    await refreshMail({inbox:true});
    await load({silent:true});
    toast('Correio e candidaturas sincronizados.');
  });
  if(action==='mail-disconnect')return withBusy(target,async()=>{
    if(!confirm('Desconectar sua conta de e-mail do Kito?'))return;
    await api('/api/mail/disconnect',{});
    await refreshMail();
    toast('Gmail desconectado deste computador.');
  });
  if(action==='mail-connect')return connectMail();
  if(action==='mail-connect-cancel')return cancelMailConnect();
  if(action==='edit-bank-category'){
    const entry=state.banking?.transactions?.find(t=>t.id===id);
    if(!entry)return toast('Movimentação não encontrada.','error');
    const options=`<option value="">Automática (${text(entry.category_label)})</option>${bankCategoryOptions(entry.category_override)}`;
    return openDialog('Corrigir categoria','MOVIMENTAÇÃO BANCÁRIA',
      `<form data-form="bank-category" data-id="${escapeHTML(id)}" class="dialog-form">
        <p class="bank-dialog-help">${text(entry.description)} · ${displayBankMoney(Math.abs(entry.amount_cents),entry.currency)}</p>
        <label class="form-field"><span>Categoria</span><select name="category">${options}</select></label>
        ${formActions('Salvar categoria')}</form>`);
  }
  if(action==='delete-finance-bill')return withBusy(target,async()=>{
    if(!confirm('Excluir esta conta a pagar e o histórico dos seus pagamentos?'))return;
    await api(`/api/finance/bills/${id}/delete`,{});
    await load();toast('Conta excluída.');
  });
  if(action==='sync-bank')return withBusy(target,async()=>{
    await syncBanks();
  });
  if(action==='remove-bank-item')return withBusy(target,async()=>{
    if(!confirm('Remover esta conexão e seus dados bancários importados do Kito? A conexão no Pluggy continuará ativa.'))return;
    await api(`/api/banking/items/${encodeURIComponent(id)}/remove`,{});
    await load();toast('Conexão removida do Kito.');
  });
  if(action==='clear-bank-credentials')return withBusy(target,async()=>{
    if(!window.wndBank||!confirm('Excluir as credenciais Pluggy guardadas neste computador?'))return;
    await window.wndBank.clearCredentials();
    closeDialog();await load();toast('Credenciais locais excluídas.');
  });
  if(action==='move-overview-card')return withBusy(target,async()=>{
    const card=target.dataset.card;
    const move=target.dataset.move;
    const layout=structuredClone(currentOverviewLayout());
    const from=layout.main.includes(card)?'main':'aside';
    const index=layout[from].indexOf(card);
    if(index<0)return;
    if(move==='switch'){
      layout[from].splice(index,1);
      layout[from==='main'?'aside':'main'].push(card);
    }else{
      const next=index+(move==='up'?-1:1);
      if(next<0||next>=layout[from].length)return;
      [layout[from][index],layout[from][next]]=[layout[from][next],layout[from][index]];
    }
    await api('/api/preferences/overview-layout',layout);
    await load();
    main.querySelector(`[data-action="move-overview-card"][data-card="${card}"][data-move="${move}"]:not(:disabled)`)?.focus();
    toast('Layout atualizado.');
  });
  if(action==='reset-overview-layout')return withBusy(target,async()=>{
    await api('/api/preferences/overview-layout',defaultOverviewLayout);
    await load();
    main.querySelector('[data-action="reset-overview-layout"]')?.focus();
    toast('Layout padrão restaurado.');
  });
   if(action.startsWith('go-'))return navigate(action.slice(3),true,true);
  if(action.startsWith('add-'))return addDialog(action.slice(4));
  if(action==='close-dialog')return closeDialog();
  if(action==='edit-space')return addDialog('space-edit');
  if(action==='delete-space')return withBusy(target,async()=>{
    const s=spaceForView();if(!s||!confirm(`Excluir o espaço "${s.title}" e todos os blocos?`))return;
    await api(`/api/spaces/${s.id}/delete`,{});state.view='spaces';await load();navigate('spaces');toast('Espaço excluído.');
  });
  if(action==='delete-space-item')return withBusy(target,async()=>{
    if(!confirm('Excluir este bloco?'))return;
    await api(`/api/spaces/${target.dataset.space}/items/${id}/delete`,{});await load();toast('Bloco excluído.');
  });
  if(action==='history')return historyDialog();
  if(action==='job-filter'){
    state.jobFilter=target.dataset.filter;
    $$('.filter').forEach(el=>{const selected=el.dataset.filter===state.jobFilter;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});
    updateJobResults();return;
  }
  if(action==='bank-direction'){
    state.bankDirection=target.dataset.direction;
    $$('.bank-direction-filter',main).forEach(el=>{
      const selected=el.dataset.direction===state.bankDirection;
      el.classList.toggle('selected',selected);
      el.setAttribute('aria-pressed',String(selected));
    });
    updateBankResults();return;
  }
  if(action==='job-detail')return jobDetail(id);
  if(action==='delete-job')return withBusy(target,async()=>{
    const job=state.jobs.find(item=>item.id===id);
    if(!confirm(`Excluir definitivamente ${job?.title||'esta vaga'}? Os detalhes e o histórico serão removidos. A vaga não será importada novamente pelo mesmo link.`))return;
    await api(`/api/opportunities/${id}/delete`,{});
    closeDialog();await load();toast('Vaga excluída.');
  });
  if(action==='refresh'){await withBusy(target,refreshAll);return;}
  if(action==='approve-job'||action==='reject-job')return withBusy(target,async()=>{
    if(action==='approve-job'){
      const form=$('[data-form="opportunity"]');if(form){const values=Object.fromEntries(new FormData(form));await api(`/api/opportunities/${id}/edit`,values);}
      const response=await api(`/api/opportunities/${id}/approve`,{});
      toast(response.message||'Oportunidade aprovada.',response.item?.status==='failed'?'error':undefined);
      closeDialog();await load();
      if(response.item?.status==='needs_action')jobDetail(id);
      return;
    }else{
      const job=state.jobs.find(item=>item.id===id);
      const message=job?.status==='approved'&&job.channel==='email'
        ?'Rejeitar esta vaga e retirar a candidatura da fila de envio?'
        :'Rejeitar esta oportunidade?';
      if(!confirm(message))return;
      await api(`/api/opportunities/${id}/reject`,{});toast('Oportunidade rejeitada.');
    }
    closeDialog();await load();
  });
  if(action==='packet-job')return withBusy(target,async()=>{const r=await api(`/api/opportunities/${$('#dialog').dataset.jobId}/packet`,{});toast(`Pacote salvo em: ${r.item.folder}`);});
  if(action.startsWith('delete-'))return withBusy(target,async()=>{if(!confirm('Excluir este registro?'))return;const module=({ 'delete-task':'tasks','delete-routine':'routines','delete-transaction':'transactions','delete-shortcut':'shortcuts'})[action];await api(`/api/${module}/${id}/delete`,{});await load();toast('Registro excluído.');});
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.id==='block-kind'){
    const urlField=$('.block-url-field');if(urlField){urlField.hidden=t.value!=='link';urlField.querySelector('input').required=t.value==='link';}return;
  }
  if(!t.dataset.action)return;
  if(t.dataset.action==='toggle-finance-bill')return withBusy(t,async()=>{
    try{
      await api(`/api/finance/bills/${encodeURIComponent(t.dataset.id)}/paid`,{month:financeMonth(),paid:t.checked});
    }catch(error){t.checked=!t.checked;throw error;}
    await load();
  });
  if(t.dataset.action==='toggle-space-item')return withBusy(t,async()=>{
    await api(`/api/spaces/${t.dataset.space}/items/${t.dataset.id}/toggle`,{done:t.checked});await load();
  });
  if(t.dataset.action==='toggle-startup')return withBusy(t,async()=>{
    try {
      state.startup=await window.wndWindow.setStartup(t.checked);
      state.startupError='';
      toast(state.startup.enabled?'Inicialização com o Windows ativada.':'Inicialização com o Windows desativada.');
    } catch(error) {
      t.checked=Boolean(state.startup?.enabled);
      state.startupError=error.message;
      throw error;
    }
  });
  if(t.dataset.action==='toggle-task'||t.dataset.action==='toggle-routine'){
    await withBusy(t,async()=>{
      const module=t.dataset.action==='toggle-task'?'tasks':'routines';
      const id=t.dataset.id;
      const done=t.checked;
      await api(`/api/${module}/${id}/toggle`,module==='tasks'?{done}:{done,day:localDay()});
      await load();
      if(module==='tasks'){
        toast(done?'Tarefa concluída.':'Tarefa reaberta.','success',{
          label:'Desfazer',
          onClick:async()=>{
            try {await api(`/api/tasks/${id}/toggle`,{done:!done});await load();toast('Alteração desfeita.');}
            catch(error){toast(error.message,'error');}
          }
        });
      }
    });
  }
  if(t.dataset.action==='toggle-module'){
    await withBusy(t,async()=>{const modules={...state.hub.modules,[t.dataset.moduleName]:t.checked};await api('/api/preferences/modules',modules);await load();toast('Preferências atualizadas.');});
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='job-search'){state.jobSearch=e.target.value;updateJobResults();}
  if(e.target.id==='bank-search'){state.bankSearch=e.target.value;updateBankResults();}
  if(e.target.id==='mail-search'){
    state.mailSearch=e.target.value;
    const caret=e.target.selectionStart;
    render();
    const input=$('#mail-search');
    input?.focus({preventScroll:true});
    input?.setSelectionRange(caret,caret);
  }
  if(e.target.name==='message'&&e.target.closest('[data-form="mail-reply"]'))state.mailDraft=e.target.value;
});
document.addEventListener('toggle',e=>{
  if(e.target.matches?.('details[data-bank-section]'))
    state.bankExpanded[e.target.dataset.bankSection]=e.target.open;
},true);
document.addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();const submit=$('button[type="submit"]',form);
  await withBusy(submit,async()=>{
    const kind=form.dataset.form,values=Object.fromEntries(new FormData(form).entries());
    let destination=null;
    if(kind==='job-preferences'){
      for(const key of ['remote_only','exclude_senior','exclude_unpaid'])values[key]=new FormData(form).has(key);
      values.min_score=Number(values.min_score);
      await api('/api/preferences/jobs',values);
      await load();
      toast('Preferências de vagas atualizadas.');
      return;
    }else if(kind==='mail-configure'){
      await api('/api/mail/configure',{clientId:values.clientId,clientSecret:values.clientSecret});
      await refreshMail();
      toast('Credenciais do Gmail salvas com proteção do Windows.');
      return;
    }else if(kind==='mail-reply'){
      await api(`/api/mail/threads/${encodeURIComponent(form.dataset.id)}/reply`,{message:values.message});
      state.mailDraft='';
      await openMailThread(form.dataset.id);
      toast('Resposta enviada pelo Gmail.');
      return;
    }else if(kind==='bank-credentials'){
      if(!window.wndBank)throw Error('Salve as credenciais no aplicativo Windows.');
      await window.wndBank.saveCredentials(values.clientId,values.clientSecret);
      closeDialog();toast('Credenciais guardadas no Windows.');
    }else if(kind==='bank-item'){
      await api('/api/banking/items',{itemId:values.itemId.trim()});
      closeDialog();toast('Conexão cadastrada. Agora sincronize os bancos.');
    }else if(kind==='bank-category'){
      await api(`/api/banking/transactions/${encodeURIComponent(form.dataset.id)}/category`,{category:values.category});
      closeDialog();toast('Categoria salva.');
    }else if(kind==='job'){
      const result=await api('/api/opportunities',values);
      if(!result.created)throw Error(result.dismissed?'Você já descartou esta vaga. Ela não será adicionada novamente.':'Esta vaga já está na sua lista.');
      state.jobFilter='all';state.jobSearch='';
      closeDialog();toast('Vaga adicionada para revisão.');
    }else if(kind==='opportunity'){await api(`/api/opportunities/${form.dataset.id}/edit`,values);closeDialog();toast('Alterações salvas.');}
    else if(kind==='space'){
      const created=await api('/api/spaces',values);destination=`space-${created.id}`;closeDialog();toast('Espaço criado.');
    }else if(kind==='space-edit'){
      await api(`/api/spaces/${spaceForView().id}/edit`,values);closeDialog();toast('Espaço atualizado.');
    }else if(kind==='space-item'){
      await api(`/api/spaces/${spaceForView().id}/items`,values);closeDialog();toast('Bloco adicionado.');
    }
    else{
      const endpoint={task:'tasks',routine:'routines',finance:'transactions','finance-bill':'finance/bills',shortcut:'shortcuts'}[kind];
      if(kind==='finance'||kind==='finance-bill'){
        const normalized=values.amount.trim().replace(/\s|R\$/gi,'');
        const numeric=normalized.includes(',')?normalized.replace(/\./g,'').replace(',','.'):normalized;
        const cents=Math.round(Number(numeric)*100);
        if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Informe um valor válido, como 49,90.');
        values.amount_cents=cents;delete values.amount;
        if(kind==='finance-bill')values.repeat_monthly=values.repeat_monthly==='on';
      }
      await api(`/api/${endpoint}`,values);closeDialog();toast('Registro salvo.');
    }
    await load();
    if(destination)navigate(destination);
  });
});
$('#close-dialog').addEventListener('click',closeDialog);
dialogBackdrop.addEventListener('click',e=>{if(e.target===dialogBackdrop)closeDialog();});
document.addEventListener('keydown',e=>{
  if(dialogBackdrop.hidden)return;
  if(e.key==='Escape'){e.preventDefault();closeDialog();return;}
  if(e.key==='Tab'){
    const all=$$('button:not([disabled]),[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled])',$('#dialog')).filter(el=>!el.closest('[hidden]')&&!el.hidden);
    if(!all.length)return;
    const first=all[0],last=all.at(-1);
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }
});
$('#refresh').addEventListener('click',()=>withBusy($('#refresh'),refreshAll));
mobileMenu.addEventListener('click',()=>setMobileMenu(!document.body.classList.contains('sidebar-open'),{restoreFocus:true}));
mobileShade.addEventListener('click',()=>setMobileMenu(false,{restoreFocus:true}));
mobileQuery.addEventListener('change',()=>setMobileMenu(false));
document.addEventListener('keydown',event=>{
  if(!document.body.classList.contains('sidebar-open')||!dialogBackdrop.hidden)return;
  if(event.key==='Escape'){
    event.preventDefault();setMobileMenu(false,{restoreFocus:true});
  }else if(event.key==='Tab'){
    const links=$$('a[href],button:not([disabled])',sidebar).filter(el=>!el.closest('[hidden]'));
    if(!links.length)return;
    const first=links[0],last=links.at(-1);
    if(event.shiftKey&&(document.activeElement===first||!sidebar.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!sidebar.contains(document.activeElement))){event.preventDefault();first.focus();}
  }
});
setMobileMenu(false);
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1),false,true));
state.view=labels[location.hash.slice(1)]?location.hash.slice(1):'overview';
load().then(()=>{
  navigate(state.view);
  refreshMail().catch(()=>{});
  refreshVisibleData().catch(()=>{});
}).catch(err=>{main.innerHTML=empty('Não foi possível abrir o Kito',escapeHTML(err.message));toast(err.message,'error');});
function updatePCMetrics(){
  const p=state.pc;
  if(!p||!['overview','pc'].includes(state.view))return;
  const values={
    'overview-memory':`${p.memory_percent??'—'}`,
    'mini-cpu':p.cpu_percent==null?'—':`${p.cpu_percent}%`,
    'mini-memory':p.memory_percent==null?'—':`${p.memory_percent}%`,
    'detail-cpu':p.cpu_percent==null?'Calculando...':`${p.cpu_percent}%`,
    'detail-memory':`${p.memory_percent??0}%`,
    'detail-uptime':uptime(p.uptime||0),
    'detail-ram-usage':`${formatBytes(p.memory_used)} de ${formatBytes(p.memory_total)}`,
    'detail-updated':fmtTime(p.updated_at)
  };
  for(const [key,value] of Object.entries(values)){
    const element=main.querySelector(`[data-pc-value="${key}"]`);
    if(!element)continue;
    if(key==='overview-memory'){
      // Preserve o <em> de unidade para manter a tipografia do resumo.
      element.firstChild.textContent=value;
      let unit=element.querySelector('em');
      if(!unit){unit=document.createElement('em');element.append(unit);}
      unit.textContent='%';
    }else if(element.textContent!==value)element.textContent=value;
  }
  const meters={
    'overview-memory':p.memory_percent,
    'mini-cpu':p.cpu_percent,
    'mini-memory':p.memory_percent,
    'detail-cpu':p.cpu_percent,
    'detail-memory':p.memory_percent
  };
  for(const [key,value] of Object.entries(meters)){
    const element=main.querySelector(`[data-pc-meter="${key}"]`);
    if(element)element.value=Number.isFinite(value)?value:0;
  }
}
let pcRequestInFlight=false;
async function refreshPCMetrics(){
  if(pcRequestInFlight||document.hidden||!['overview','pc'].includes(state.view))return;
  pcRequestInFlight=true;
  try{state.pc=await api('/api/pc');updatePCMetrics();}catch{}finally{pcRequestInFlight=false;}
}
setInterval(refreshPCMetrics,15000);
