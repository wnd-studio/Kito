export const initialData = () => ({
  version: 1,
  nextId: 1,
  tasks: [], routines: [], transactions: [], bills: [], jobs: [], spaces: [], shortcuts: [],
  routineDays: {}, billPayments: {}, settings: {theme: 'original'}
});

const arrays = ['tasks', 'routines', 'transactions', 'bills', 'jobs', 'spaces', 'shortcuts'];
export function normalizeData(input) {
  if (!input || typeof input !== 'object' || input.version !== 1) throw Error('Backup incompatível.');
  const data = initialData();
  for (const key of arrays) {
    if (!Array.isArray(input[key]) || input[key].length > 10000) throw Error(`Dados inválidos em ${key}.`);
    data[key] = structuredClone(input[key]);
  }
  data.nextId = Number.isSafeInteger(input.nextId) && input.nextId > 0 ? input.nextId : 1;
  for (const list of arrays) for (const entry of data[list]) {
    if (!Number.isSafeInteger(entry?.id) || entry.id < 1) throw Error('Identificador inválido.');
    data.nextId = Math.max(data.nextId, entry.id + 1);
  }
  data.routineDays = input.routineDays && typeof input.routineDays === 'object' && !Array.isArray(input.routineDays) ? structuredClone(input.routineDays) : {};
  data.billPayments = input.billPayments && typeof input.billPayments === 'object' && !Array.isArray(input.billPayments) ? structuredClone(input.billPayments) : {};
  data.settings = {theme: ['original', 'midnight', 'graphite', 'light'].includes(input.settings?.theme) ? input.settings.theme : 'original'};
  return data;
}

export const today = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const month = (date = new Date()) => today(date).slice(0, 7);
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format((Number(cents) || 0) / 100);
export function parseCents(value) {
  const raw = String(value).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  const cents = Math.round(number * 100);
  if (!raw || !Number.isFinite(number) || !Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000) throw Error('Informe um valor positivo válido.');
  return cents;
}
export function safeUrl(value) {
  const url = new URL(String(value).trim());
  if (!['https:', 'http:'].includes(url.protocol)) throw Error('Informe um link HTTP ou HTTPS.');
  return url.href;
}
export function billForMonth(bill, selected = month()) {
  if (bill.repeat && bill.due_on.slice(0, 7) <= selected) {
    const [year, mon] = selected.split('-').map(Number);
    const last = new Date(year, mon, 0).getDate();
    return {...bill, due_on: `${selected}-${String(Math.min(Number(bill.due_on.slice(8)), last)).padStart(2, '0')}`};
  }
  return bill.due_on.slice(0, 7) === selected ? bill : null;
}
export function totals(data, selected = month()) {
  return data.transactions.reduce((s, transaction) => {
    if (transaction.occurred_on.slice(0, 7) === selected) s[transaction.type] += transaction.amount_cents;
    return s;
  }, {income: 0, expense: 0});
}
export function newEntry(data, type, values) {
  if (!arrays.includes(type)) throw Error('Tipo inválido.');
  const entry = {id: data.nextId++, created_at: new Date().toISOString(), ...values};
  data[type].unshift(entry);
  return entry;
}
