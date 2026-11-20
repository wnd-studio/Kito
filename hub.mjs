import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { dbPath, canonicalUrl } from './core.mjs';
import { BANK_CATEGORIES, bankInsights, classifyBankTransaction, transactionKind } from './bank-insights.mjs';
import { DEFAULT_JOB_PREFERENCES, LEGACY_JOB_PREFERENCES, validateJobPreferences } from './job-preferences.mjs';

const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS hub_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal', due_date TEXT, done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS hub_routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, time TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_routine_days (
  routine_id INTEGER NOT NULL, day TEXT NOT NULL, completed_at TEXT NOT NULL,
  PRIMARY KEY(routine_id, day), FOREIGN KEY(routine_id) REFERENCES hub_routines(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS hub_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL,
  type TEXT NOT NULL, amount_cents INTEGER NOT NULL, category TEXT NOT NULL DEFAULT 'Geral',
  occurred_on TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_shortcuts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hub_spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_space_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER NOT NULL REFERENCES hub_spaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('note','check','link')),
  title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hub_space_items_space ON hub_space_items(space_id, id);
CREATE TABLE IF NOT EXISTS bank_items (
  id TEXT PRIMARY KEY, institution TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING',
  consent_expires_at TEXT, last_synced_at TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES bank_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL, subtype TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'BRL', balance_cents INTEGER, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_item ON bank_accounts(item_id);
CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  description TEXT NOT NULL, amount_cents INTEGER NOT NULL, occurred_on TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(occurred_on DESC, id DESC);
CREATE TABLE IF NOT EXISTS bank_category_overrides (
  transaction_id TEXT PRIMARY KEY, category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS finance_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outras', due_on TEXT NOT NULL,
  repeat_monthly INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS finance_bill_payments (
  bill_id INTEGER NOT NULL REFERENCES finance_bills(id) ON DELETE CASCADE,
  month TEXT NOT NULL, paid_at TEXT NOT NULL, PRIMARY KEY(bill_id, month)
);
`);
db.exec('PRAGMA foreign_keys=ON');

const ISO = () => new Date().toISOString();
const str = (v, max=300) => String(v ?? '').trim().slice(0, max);
const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T12:00:00Z`));
const validMonth = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const requireText = (v,name,max=200) => { const s=str(v,max); if(!s)throw Error(`${name} obrigatório.`);return s; };
const idNum = (id) => {const n=Number(id);if(!Number.isSafeInteger(n)||n<1)throw Error('Identificador inválido.');return n;};
const changes = (query,...args) => {const r=db.prepare(query).run(...args);if(!r.changes)throw Error('Registro inexistente.');return r;};
const DEFAULT_OVERVIEW_LAYOUT = Object.freeze({main:['jobs','tasks'],aside:['routine','finance','pc']});
const OVERVIEW_CARDS = ['jobs','tasks','routine','finance','pc'];

function validateOverviewLayout(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
     Object.keys(value).sort().join(',')!=='aside,main' ||
     !Array.isArray(value.main) || !Array.isArray(value.aside)) throw Error('Disposição inválida.');
  const cards=[...value.main,...value.aside];
  if(cards.length!==OVERVIEW_CARDS.length || new Set(cards).size!==OVERVIEW_CARDS.length ||
     cards.some(key=>!OVERVIEW_CARDS.includes(key))) throw Error('A disposição deve conter os cinco cards, sem repetições.');
  return {main:[...value.main],aside:[...value.aside]};
}

export function getOverviewLayout(){
  const stored=db.prepare("SELECT value FROM hub_preferences WHERE key='overview_layout'").get()?.value;
  if(!stored)return {main:[...DEFAULT_OVERVIEW_LAYOUT.main],aside:[...DEFAULT_OVERVIEW_LAYOUT.aside]};
  try{return validateOverviewLayout(JSON.parse(stored));}catch{return {main:[...DEFAULT_OVERVIEW_LAYOUT.main],aside:[...DEFAULT_OVERVIEW_LAYOUT.aside]};}
}
export function setOverviewLayout(value){
  const layout=validateOverviewLayout(value);
  db.prepare("INSERT INTO hub_preferences(key,value) VALUES('overview_layout',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(layout));
  return layout;
}

export function getJobPreferences() {
  const stored=db.prepare("SELECT value FROM hub_preferences WHERE key='job_preferences'").get()?.value;
  if (stored) {
    try { return validateJobPreferences(JSON.parse(stored)); } catch { /* versões antigas ou dados inválidos */ }
  }
  // Migração única. Depois de salva, a preferência não depende da quantidade de vagas.
  const existing=db.prepare('SELECT 1 FROM opportunities LIMIT 1').get();
  const preferences={ ...(existing ? LEGACY_JOB_PREFERENCES : DEFAULT_JOB_PREFERENCES) };
  return setJobPreferences(preferences);
}

export function setJobPreferences(value) {
  const preferences=validateJobPreferences(value);
  db.prepare("INSERT INTO hub_preferences(key,value) VALUES('job_preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(preferences));
  return preferences;
}

export function getHub(day) {
  if(!validDate(day)) throw Error('Data inválida.');
  const tasks=db.prepare('SELECT * FROM hub_tasks ORDER BY done ASC, CASE priority WHEN \'high\' THEN 0 WHEN \'normal\' THEN 1 ELSE 2 END, due_date IS NULL, due_date, id DESC').all();
  const routines=db.prepare('SELECT r.*, CASE WHEN d.day IS NULL THEN 0 ELSE 1 END AS done FROM hub_routines r LEFT JOIN hub_routine_days d ON d.routine_id=r.id AND d.day=? ORDER BY r.time, r.id').all(day);
  const transactions=db.prepare('SELECT * FROM hub_transactions ORDER BY occurred_on DESC,id DESC LIMIT 300').all();
  const shortcuts=db.prepare('SELECT * FROM hub_shortcuts ORDER BY id DESC').all();
  const spaces=db.prepare('SELECT * FROM hub_spaces ORDER BY id DESC').all();
  const allItems=db.prepare('SELECT * FROM hub_space_items ORDER BY id DESC').all();
  for(const space of spaces)space.items=allItems.filter(item=>item.space_id===space.id);
  const monthly=day.slice(0,7);
  const sums=db.prepare('SELECT type,COALESCE(SUM(amount_cents),0) AS amount FROM hub_transactions WHERE occurred_on LIKE ? GROUP BY type').all(`${monthly}%`);
  const income=sums.find(x=>x.type==='income')?.amount||0, expense=sums.find(x=>x.type==='expense')?.amount||0;
  const modules=JSON.parse(db.prepare("SELECT value FROM hub_preferences WHERE key='modules'").get()?.value||'{"finance":true,"routine":true,"tasks":true,"pc":true,"shortcuts":true}');
  return {tasks,routines,transactions,shortcuts,spaces,modules,job_preferences:getJobPreferences(),overview_layout:getOverviewLayout(),finance:{income,expense,balance:income-expense,month:monthly}};
}

export function addSpace(d){
  const title=requireText(d?.title,'Nome do espaço',100);
  const r=db.prepare('INSERT INTO hub_spaces(title,description,created_at) VALUES(?,?,?)').run(title,str(d.description,800),ISO());
  return {id:Number(r.lastInsertRowid)};
}
export function editSpace(id,d){
  const title=requireText(d?.title,'Nome do espaço',100);
  changes('UPDATE hub_spaces SET title=?,description=? WHERE id=?',title,str(d.description,800),idNum(id));
  return {ok:true};
}
export function deleteSpace(id){changes('DELETE FROM hub_spaces WHERE id=?',idNum(id));return {ok:true};}
export function addSpaceItem(id,d){
  const spaceId=idNum(id);
  if(!db.prepare('SELECT id FROM hub_spaces WHERE id=?').get(spaceId))throw Error('Espaço não encontrado.');
  const kind=d?.kind;
  if(!['note','check','link'].includes(kind))throw Error('Tipo de bloco inválido.');
  const title=requireText(d?.title,'Título',180);
  const content=str(d.content,12000);
  const url=kind==='link'?canonicalUrl(d.url):'';
  const r=db.prepare('INSERT INTO hub_space_items(space_id,kind,title,content,url,created_at) VALUES(?,?,?,?,?,?)').run(spaceId,kind,title,content,url,ISO());
  return {id:Number(r.lastInsertRowid)};
}
export function toggleSpaceItem(id,itemId,done){
  changes("UPDATE hub_space_items SET done=? WHERE id=? AND space_id=? AND kind='check'",done?1:0,idNum(itemId),idNum(id));
  return {ok:true};
}
export function deleteSpaceItem(id,itemId){
  changes('DELETE FROM hub_space_items WHERE id=? AND space_id=?',idNum(itemId),idNum(id));return {ok:true};
}

export function addTask(d) {
  const title=requireText(d.title,'Título'),priority=['low','normal','high'].includes(d.priority)?d.priority:'normal';
  if(d.due_date && !validDate(d.due_date))throw Error('Data inválida.');
  const r=db.prepare('INSERT INTO hub_tasks(title,notes,priority,due_date,created_at) VALUES(?,?,?,?,?)').run(title,str(d.notes,4000),priority,d.due_date||null,ISO());
  return {id:Number(r.lastInsertRowid)};
}
export function toggleTask(id,done){
  changes('UPDATE hub_tasks SET done=?,completed_at=? WHERE id=?',done?1:0,done?ISO():null,idNum(id));return {ok:true};
}
export function deleteTask(id){changes('DELETE FROM hub_tasks WHERE id=?',idNum(id));return {ok:true};}

export function addRoutine(d) {
  const title=requireText(d.title,'Atividade');const time=str(d.time,5);
  if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Horário inválido.');
  const r=db.prepare('INSERT INTO hub_routines(title,time,created_at) VALUES(?,?,?)').run(title,time,ISO());return {id:Number(r.lastInsertRowid)};
}
export function routineDay(id,day,done){
  const n=idNum(id);if(!validDate(day))throw Error('Data inválida.');
  if(!db.prepare('SELECT id FROM hub_routines WHERE id=?').get(n))throw Error('Atividade inexistente.');
  if(done)db.prepare('INSERT OR IGNORE INTO hub_routine_days(routine_id,day,completed_at) VALUES(?,?,?)').run(n,day,ISO());
  else db.prepare('DELETE FROM hub_routine_days WHERE routine_id=? AND day=?').run(n,day);
  return {ok:true};
}
export function deleteRoutine(id){changes('DELETE FROM hub_routines WHERE id=?',idNum(id));return {ok:true};}

export function addTransaction(d){
  const description=requireText(d.description,'Descrição');
  if(!['income','expense'].includes(d.type))throw Error('Tipo inválido.');
  const amount=Number(d.amount_cents);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000000)throw Error('Valor inválido.');
  if(!validDate(d.occurred_on))throw Error('Data inválida.');
  const r=db.prepare('INSERT INTO hub_transactions(description,type,amount_cents,category,occurred_on,created_at) VALUES(?,?,?,?,?,?)').run(description,d.type,amount,str(d.category,90)||'Geral',d.occurred_on,ISO());return {id:Number(r.lastInsertRowid)};
}
export function deleteTransaction(id){changes('DELETE FROM hub_transactions WHERE id=?',idNum(id));return {ok:true};}

export function addFinanceBill(data) {
  const description = requireText(data.description, 'Descrição');
  const amount = Number(data.amount_cents);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000000) throw Error('Valor inválido.');
  if (!validDate(data.due_on)) throw Error('Vencimento inválido.');
  const category = str(data.category, 90) || 'Outras';
  const result = db.prepare(`INSERT INTO finance_bills(description,amount_cents,category,due_on,repeat_monthly,created_at)
    VALUES(?,?,?,?,?,?)`).run(description, amount, category, data.due_on, data.repeat_monthly === true ? 1 : 0, ISO());
  return { id: Number(result.lastInsertRowid) };
}

export function getFinanceBills(month) {
  if (!validMonth(month)) throw Error('Mês inválido.');
  const rows = db.prepare(`SELECT b.*, p.paid_at FROM finance_bills b
    LEFT JOIN finance_bill_payments p ON p.bill_id=b.id AND p.month=?
    WHERE (b.repeat_monthly=1 AND substr(b.due_on,1,7)<=?) OR substr(b.due_on,1,7)=?
    ORDER BY b.due_on, b.id`).all(month, month, month);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const bills = rows.map(row => ({ ...row,
    due_on: row.repeat_monthly ? `${month}-${String(Math.min(Number(row.due_on.slice(8)), lastDay)).padStart(2, '0')}` : row.due_on,
    paid: !!row.paid_at
  }));
  return { month, bills, owedCents: bills.filter(row => !row.paid).reduce((sum, row) => sum + row.amount_cents, 0),
    paidCents: bills.filter(row => row.paid).reduce((sum, row) => sum + row.amount_cents, 0) };
}

export function setFinanceBillPaid(id, month, paid) {
  const n = idNum(id);
  if (!validMonth(month) || !getFinanceBills(month).bills.some(row => row.id === n)) throw Error('Conta ou mês inválido.');
  if (paid === true) db.prepare(`INSERT OR IGNORE INTO finance_bill_payments(bill_id,month,paid_at) VALUES(?,?,?)`).run(n, month, ISO());
  else if (paid === false) db.prepare('DELETE FROM finance_bill_payments WHERE bill_id=? AND month=?').run(n, month);
  else throw Error('Estado de pagamento inválido.');
  return { ok: true };
}

export function deleteFinanceBill(id) { changes('DELETE FROM finance_bills WHERE id=?', idNum(id)); return { ok: true }; }

const bankId = value => {
  const id = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw Error('Informe um itemId válido (UUID) do Pluggy.');
  return id;
};

export function addBankItem(value) {
  const id = bankId(value);
  db.prepare('INSERT OR IGNORE INTO bank_items(id) VALUES(?)').run(id);
  return { id };
}

export function removeBankItem(value) {
  changes('DELETE FROM bank_items WHERE id=?', bankId(value));
  return { ok: true };
}

export function getBanking(month = new Date().toISOString().slice(0, 7)) {
  if (!validMonth(month)) throw Error('Mês inválido.');
  const items = db.prepare('SELECT * FROM bank_items ORDER BY institution, id').all();
  const accounts = db.prepare('SELECT * FROM bank_accounts ORDER BY name, id').all();
  const allTransactions = db.prepare(`SELECT t.*, o.category AS category_override,
    a.name AS account_name, a.currency, a.type AS account_type, i.institution
    FROM bank_transactions t JOIN bank_accounts a ON a.id=t.account_id
    JOIN bank_items i ON i.id=a.item_id
    LEFT JOIN bank_category_overrides o ON o.transaction_id=t.id
    ORDER BY t.occurred_on DESC,t.id DESC`).all();
  const insights = bankInsights(allTransactions, month);
  const transactions = allTransactions.slice(0, 200).map(t => ({ ...t,
    category_label: classifyBankTransaction(t), movement_kind: transactionKind(t)
  }));
  const bankAccounts = accounts.filter(a => a.type === 'BANK');
  const brlAccounts = bankAccounts.filter(a => a.currency === 'BRL');
  const balanceComplete = items.length > 0 && items.every(i => i.last_synced_at && !i.last_error) &&
    bankAccounts.length > 0 && bankAccounts.length === brlAccounts.length &&
    brlAccounts.every(a => a.balance_cents !== null);
  const balanceCents = balanceComplete
    ? brlAccounts.reduce((total, a) => total + a.balance_cents, 0) : null;
  return { items, accounts, transactions, balanceCents, insights, bills: getFinanceBills(month) };
}

export function setBankCategory(id, category) {
  if (typeof id !== 'string' || !id || id.length > 240 ||
      !db.prepare('SELECT id FROM bank_transactions WHERE id=?').get(id)) throw Error('Movimentação inexistente.');
  if (category === '') db.prepare('DELETE FROM bank_category_overrides WHERE transaction_id=?').run(id);
  else {
    if (![...BANK_CATEGORIES, 'Transferências'].includes(category)) throw Error('Categoria inválida.');
    db.prepare(`INSERT INTO bank_category_overrides(transaction_id,category) VALUES(?,?)
      ON CONFLICT(transaction_id) DO UPDATE SET category=excluded.category`).run(id, category);
  }
  return { ok: true };
}

export function markBankError(value, message) {
  db.prepare('UPDATE bank_items SET last_error=? WHERE id=?').run(str(message, 200), bankId(value));
}

export function saveBankSync(value, item, accountsWithTransactions) {
  const itemId = bankId(value);
  if (!item || typeof item !== 'object' || !Array.isArray(accountsWithTransactions)) throw Error('Dados bancários inválidos.');
  const now = ISO();
  const cents = amount => typeof amount === 'number' && Number.isFinite(amount) &&
    Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) : null;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE bank_items SET institution=?,status=?,consent_expires_at=?,last_synced_at=?,last_error=NULL WHERE id=?`)
      .run(str(item.connector?.name || item.connector?.institutionName || 'Instituição', 120),
        str(item.status || 'UNKNOWN', 50), item.consentExpiresAt || null, now, itemId);
    const upsertAccount = db.prepare(`INSERT INTO bank_accounts(id,item_id,name,type,subtype,currency,balance_cents,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET item_id=excluded.item_id,name=excluded.name,
      type=excluded.type,subtype=excluded.subtype,currency=excluded.currency,balance_cents=excluded.balance_cents,updated_at=excluded.updated_at`);
    const upsertTransaction = db.prepare(`INSERT INTO bank_transactions(id,account_id,description,amount_cents,occurred_on,type,status,category,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET description=excluded.description,
      amount_cents=excluded.amount_cents,occurred_on=excluded.occurred_on,type=excluded.type,
      status=excluded.status,category=excluded.category,updated_at=excluded.updated_at`);
    for (const {account, transactions} of accountsWithTransactions) {
      const accountId = String(account?.id || '');
      if (!accountId || account.itemId !== itemId || !Array.isArray(transactions)) throw Error('Conta inválida retornada pelo Pluggy.');
      upsertAccount.run(accountId, itemId, str(account.marketingName || account.name || 'Conta', 160),
        str(account.type, 24), str(account.subtype, 60), str(account.currencyCode || 'BRL', 8), cents(account.balance), now);
      // A API retorna o recorte atual de 180 dias. Remova transações que saíram desse recorte
      // ou que foram removidas no banco, dentro da mesma transação SQLite da importação.
      db.prepare('DELETE FROM bank_transactions WHERE account_id=?').run(accountId);
      for (const transaction of transactions) {
        if (!transaction?.id || transaction.accountId !== accountId ||
            !validDate(transaction.date?.slice(0, 10)) || cents(transaction.amount) === null) {
          throw Error('Movimentação inválida retornada pelo Pluggy.');
        }
        upsertTransaction.run(String(transaction.id), accountId,
          str(transaction.description || 'Movimentação', 240), cents(transaction.amount),
          transaction.date.slice(0, 10), str(transaction.type, 30), str(transaction.status, 30),
          str(transaction.category || '', 120), now);
      }
    }
    const received = accountsWithTransactions.map(({account}) => account.id);
    for (const row of db.prepare('SELECT id FROM bank_accounts WHERE item_id=?').all(itemId)) {
      if (!received.includes(row.id)) db.prepare('DELETE FROM bank_accounts WHERE id=?').run(row.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function addShortcut(d){
  const label=requireText(d.label,'Nome');const url=canonicalUrl(d.url);
  const r=db.prepare('INSERT INTO hub_shortcuts(label,url,created_at) VALUES(?,?,?)').run(label,url,ISO());return {id:Number(r.lastInsertRowid)};
}
export function deleteShortcut(id){changes('DELETE FROM hub_shortcuts WHERE id=?',idNum(id));return {ok:true};}

export function setModules(d){
  const allowed=['finance','routine','tasks','pc','shortcuts'];
  if(!d || typeof d!=='object'||Array.isArray(d))throw Error('Preferências inválidas.');
  const next=Object.fromEntries(allowed.map(k=>[k,d[k]!==false]));
  db.prepare("INSERT INTO hub_preferences(key,value) VALUES('modules',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));return next;
}

let previousCpu = null;
function cpuUsage(){
  const current=os.cpus();
  const total=current.reduce((n,c)=>n+Object.values(c.times).reduce((a,b)=>a+b,0),0);
  const idle=current.reduce((n,c)=>n+c.times.idle,0);
  let usage=null;
  if(previousCpu && total>previousCpu.total)usage=Math.max(0,Math.min(100,Math.round((1-(idle-previousCpu.idle)/(total-previousCpu.total))*100)));
  previousCpu={total,idle};return usage;
}
export function getPc(){
  const cpus=os.cpus();const total=os.totalmem(),free=os.freemem();
  return {platform:os.platform(),release:os.release(),hostname:os.hostname(),cpu:cpus[0]?.model||'Não identificado',cores:cpus.length,cpu_percent:cpuUsage(),memory_total:total,memory_used:total-free,memory_percent:Math.round((1-free/total)*100),uptime:Math.floor(os.uptime()),updated_at:ISO()};
}
export function closeHub(){db.close();}
