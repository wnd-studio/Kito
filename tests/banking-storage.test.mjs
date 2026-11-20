import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setPluggyCredentialsProvider } from '../pluggy.mjs';

const folder = mkdtempSync(join(tmpdir(), 'wnd-banking-'));
process.env.VAGAS_DB_PATH = join(folder, 'test.sqlite');
const core = await import('../core.mjs');
const hub = await import('../hub.mjs');
const { refreshBankItem } = await import('../banking.mjs');
after(() => {
  setPluggyCredentialsProvider(() => ({}));
  hub.closeHub();
  core.close();
  rmSync(folder, { recursive: true, force: true });
});

test('MeuPluggy consulta o cache disponível e preserva a data de atualização original', async () => {
  hub.addBankItem(itemId);
  setPluggyCredentialsProvider(() => ({ clientId: 'test', clientSecret: 'test' }));
  let refreshCalls = 0;
  const sourceUpdatedAt = '2026-11-18T12:00:00Z';
  const result = await refreshBankItem(itemId, { clientImpl: {
    getItem: async () => ({ ...item, connector: { name: 'MeuPluggy' }, lastUpdatedAt: sourceUpdatedAt }),
    refreshItem: async () => { refreshCalls++; },
    getAccounts: async () => [account],
    getTransactions: async () => [movement('cached-tx', -4.5)]
  } });
  assert.equal(refreshCalls, 0);
  assert.equal(result.sourceUnchanged, true);
  assert.equal(result.sourceUpdatedAt, sourceUpdatedAt);
  assert.equal(hub.getBanking().items[0].source_updated_at, '2026-11-18T12:00:00.000Z');
  assert.ok(hub.getBanking().transactions.some(tx => tx.id === 'cached-tx'));
  hub.removeBankItem(itemId);
});

test('conexão direta só importa após a fonte confirmar uma atualização', async () => {
  hub.addBankItem(itemId);
  setPluggyCredentialsProvider(() => ({ clientId: 'test', clientSecret: 'test' }));
  let fetches = 0;
  let refreshes = 0;
  const result = await refreshBankItem(itemId, { clientImpl: {
    getItem: async () => ({ ...item, lastUpdatedAt: fetches++ ? '2026-11-20T12:00:00Z' : '2026-11-18T12:00:00Z' }),
    refreshItem: async () => { refreshes++; },
    getAccounts: async () => [account],
    getTransactions: async () => [movement('fresh-tx', -20)]
  }, delayImpl: async () => {} });
  assert.equal(refreshes, 1);
  assert.equal(result.pending, false);
  assert.equal(hub.getBanking().transactions[0].id, 'fresh-tx');
  hub.removeBankItem(itemId);
});

test('atualização pendente, autorização expirada e falha preservam transações existentes', async () => {
  hub.addBankItem(itemId);
  setPluggyCredentialsProvider(() => ({ clientId: 'test', clientSecret: 'test' }));
  hub.saveBankSync(itemId, item, [{ account, transactions: [movement('saved-tx', -42)] }]);
  const previous = { ...item, lastUpdatedAt: '2026-11-18T12:00:00Z' };
  const pending = await refreshBankItem(itemId, { clientImpl: {
    getItem: async () => previous,
    refreshItem: async () => {},
    getAccounts: async () => { throw Error('não deve consultar'); }
  }, delayImpl: async () => {} });
  assert.equal(pending.pending, true);
  await assert.rejects(refreshBankItem(itemId, { clientImpl: {
    getItem: async () => ({ ...previous, consentExpiresAt: '2020-01-01T00:00:00Z' })
  } }), /Autorização expirada/);
  await assert.rejects(refreshBankItem(itemId, { clientImpl: {
    getItem: async () => ({ ...previous, connector: { name: 'MeuPluggy' } }),
    getAccounts: async () => { throw Error('Falha de rede'); }
  } }), /Falha de rede/);
  assert.equal(hub.getBanking().transactions[0].id, 'saved-tx');
  hub.removeBankItem(itemId);
});

const itemId = 'b315ae8f-e47c-4499-9f6b-7e1b19613910';
const accountId = '932a021e-dd86-4ee2-959c-5e26e94f8152';
const item = { status: 'UPDATED', connector: { name: 'Banco de teste' } };
const account = { id: accountId, itemId, name: 'Conta corrente', type: 'BANK', currencyCode: 'BRL', balance: 214.32 };
const movement = (id, amount) => ({ id, accountId, description: 'Movimentação', amount, date: '2026-11-17T00:00:00.000Z', status: 'POSTED' });

test('dados bancários importados permanecem separados dos lançamentos manuais', () => {
  hub.addBankItem(itemId);
  const manual = hub.addTransaction({ description: 'Freelance', type: 'income', amount_cents: 9000, occurred_on: '2026-11-17' });
  hub.saveBankSync(itemId, item, [{ account, transactions: [movement('tx-a', -12.34), movement('tx-b', 5.67)] }]);
  const snapshot = hub.getBanking();
  assert.equal(snapshot.balanceCents, 21432);
  assert.equal(snapshot.accounts.length, 1);
  assert.deepEqual(snapshot.transactions.map(t => t.amount_cents).sort((a, b) => a - b), [-1234, 567]);
  assert.equal(snapshot.transactions[0].account_type, 'BANK');
  assert.equal(hub.getHub('2026-11-17').finance.income, 9000);

  hub.saveBankSync(itemId, item, [{ account: { ...account, balance: 200 }, transactions: [movement('tx-b', 7.89)] }]);
  assert.equal(hub.getBanking().balanceCents, 20000);
  assert.deepEqual(hub.getBanking().transactions.map(t => t.id).sort(), ['tx-a','tx-b']);

  assert.throws(() => hub.saveBankSync(itemId, item, [{ account, transactions: [movement('invalid', 20), { id: 'broken', accountId }] }]), /Movimentação inválida/);
  assert.deepEqual(hub.getBanking().transactions.map(t => t.id).sort(), ['tx-a','tx-b']);
  assert.equal(hub.getBanking().balanceCents, 20000);

  hub.removeBankItem(itemId);
  assert.equal(hub.getBanking().transactions.length, 0);
  assert.equal(hub.getBanking().accounts.length, 0);
  assert.equal(hub.getHub('2026-11-17').finance.income, 9000);
  hub.deleteTransaction(manual.id);
});

test('contas mensais, quitação e categoria corrigida persistem sem interferir nas importações', () => {
  hub.addBankItem(itemId);
  hub.saveBankSync(itemId, item, [{account,transactions:[
    {...movement('food-nov',-35.5), description:'Restaurante'}
  ]}]);
  assert.equal(hub.getBanking('2026-11').transactions[0].category_label, 'Alimentação');
  hub.setBankCategory('food-nov', 'Educação');
  hub.saveBankSync(itemId, item, [{account,transactions:[
    {...movement('food-nov',-40), description:'Restaurante'}
  ]}]);
  const banking = hub.getBanking('2026-11');
  assert.equal(banking.transactions[0].category_label, 'Educação');
  assert.equal(banking.insights.categories[0].name, 'Educação');
  assert.equal(banking.insights.expenseCents, 4000);

  const repeated = hub.addFinanceBill({description:'Aluguel',amount_cents:170000,category:'Moradia',due_on:'2026-10-31',repeat_monthly:true});
  const oneOff = hub.addFinanceBill({description:'Consulta',amount_cents:12000,category:'Saúde',due_on:'2026-11-20'});
  assert.equal(hub.getFinanceBills('2026-11').owedCents, 182000);
  assert.equal(hub.getFinanceBills('2026-11').bills.find(b=>b.id===repeated.id).due_on, '2026-11-30');
  hub.setFinanceBillPaid(repeated.id, '2026-11', true);
  assert.equal(hub.getBanking('2026-11').bills.owedCents, 12000);
  assert.equal(hub.getFinanceBills('2026-12').owedCents, 170000);
  hub.setFinanceBillPaid(repeated.id, '2026-11', false);
  assert.equal(hub.getFinanceBills('2026-11').owedCents, 182000);
  assert.throws(() => hub.setFinanceBillPaid(oneOff.id, '2026-12', true), /Conta ou mês inválido/);
  hub.deleteFinanceBill(repeated.id);
  hub.deleteFinanceBill(oneOff.id);
  assert.equal(hub.getFinanceBills('2026-11').owedCents, 0);
  hub.removeBankItem(itemId);
});
