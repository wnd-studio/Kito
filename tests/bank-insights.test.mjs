import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankInsights, classifyBankTransaction, transactionKind } from '../bank-insights.mjs';

const transaction = (id, date, amount, description, overrides = {}) => ({
  id, occurred_on: date, amount_cents: amount, description,
  account_id: 'bank-a', account_name: 'Conta corrente', account_type: 'BANK',
  currency: 'BRL', status: 'POSTED', category: '', ...overrides
});

test('classificação automática pode ser corrigida sem mudar o dado bancário', () => {
  assert.equal(classifyBankTransaction(transaction('1', '2026-11-15', -1000, 'PIX Restaurante')), 'Alimentação');
  assert.equal(classifyBankTransaction(transaction('2', '2026-11-15', -1000, 'Netflix')), 'Entretenimento');
  assert.equal(classifyBankTransaction(transaction('3', '2026-11-15', -1000, 'Adobe')), 'Assinaturas e serviços');
  assert.equal(classifyBankTransaction(transaction('4', '2026-11-15', -1000, 'Netflix', {category_override:'Educação'})), 'Educação');
  assert.equal(classifyBankTransaction(transaction('5', '2026-11-15', -1000, 'Pix enviado')), 'Transferências');
  assert.equal(classifyBankTransaction(transaction('6', '2026-11-15', -1000, 'Corrida', {category:'Taxi and ride-hailing'})), 'Transporte');
  assert.equal(classifyBankTransaction(transaction('7', '2026-11-15', -1000, 'Serviço', {category:'Digital services'})), 'Assinaturas e serviços');
  assert.equal(classifyBankTransaction(transaction('8', '2026-11-15', -100, 'IOF de OpenAI')), 'Tributos e taxas');
});

test('débito, compra no cartão, reembolso e pagamento de fatura têm sinais corretos', () => {
  assert.equal(transactionKind(transaction('bank', '2026-11-01', -900, 'Mercado')), 'expense');
  assert.equal(transactionKind(transaction('credit', '2026-11-01', 900, 'Cinema', {account_type:'CREDIT'})), 'expense');
  assert.equal(transactionKind(transaction('refund', '2026-11-01', -900, 'Estorno Cinema', {account_type:'CREDIT'})), 'refund');
  assert.equal(transactionKind(transaction('bill', '2026-11-01', -900, 'Pagamento fatura cartão')), 'transfer');
  assert.equal(transactionKind(transaction('pending', '2026-11-01', -900, 'Mercado', {status:'PENDING'})), 'ignored');
  assert.equal(transactionKind(transaction('own', '2026-11-01', 900, 'Transferência', {category:'Same person transfer'})), 'transfer');
  assert.equal(transactionKind(transaction('payment', '2026-11-01', -900, 'Valor cobrado', {category:'Credit card payment'})), 'transfer');
});

test('resumo mensal separa entradas, despesas, estornos, transferências e recorrências', () => {
  const transactions = [
    transaction('salary', '2026-11-05', 200000, 'Recebimento trabalho'),
    transaction('food', '2026-11-07', -4500, 'Supermercado'),
    transaction('refund', '2026-11-08', 500, 'Estorno supermercado'),
    transaction('card', '2026-11-12', 3900, 'Cinema', {account_type:'CREDIT', account_id:'card'}),
    transaction('own-out', '2026-11-18', -10000, 'PIX enviado'),
    transaction('own-in', '2026-11-18', 10000, 'PIX recebido', {account_id:'bank-b'}),
    transaction('card-payment', '2026-11-17', -50000, 'Pagamento de fatura do cartão'),
    transaction('external-pix', '2026-11-20', -1200, 'Pix enviado para pessoa'),
    transaction('netflix-sep', '2026-09-15', -3990, 'Netflix'),
    transaction('netflix-oct', '2026-10-15', -3990, 'Netflix'),
    transaction('netflix-nov', '2026-11-15', -3990, 'Netflix'),
    transaction('spotify-sep', '2026-09-10', -2190, 'Spotify'),
    transaction('spotify-oct', '2026-10-10', -2190, 'Spotify'),
    transaction('adobe-sep', '2026-09-30', -2990, 'Adobe Creative Cloud'),
    transaction('adobe-oct', '2026-10-31', -2990, 'Adobe Creative Cloud')
  ];
  const result = bankInsights(transactions, '2026-11');
  assert.equal(result.incomeCents, 200000);
  assert.equal(result.expenseCents, 4000 + 3900 + 1200 + 3990);
  assert.equal(result.netCents, 200000 - result.expenseCents);
  assert.equal(result.excludedTransfers, 2);
  assert.equal(result.estimatedDueCents, 2190 + 2990);
  assert.equal(result.recurring.length, 3);
  assert.equal(result.recurring.find(row => row.merchant === 'Netflix').paidThisMonth, true);
  assert.equal(result.recurring.find(row => row.merchant === 'Adobe').nextDue, '2026-11-30');
  assert.deepEqual(result.categories.map(row => row.name).sort(), ['Alimentação', 'Entretenimento', 'Transferências']);
});

test('previsão mantém o dia habitual ao atravessar meses curtos', () => {
  const payments = [
    transaction('a', '2026-09-30', -2990, 'Adobe Creative Cloud'),
    transaction('b', '2026-10-31', -2990, 'Adobe Creative Cloud')
  ];
  assert.equal(bankInsights(payments, '2026-12').recurring[0].nextDue, '2026-12-31');
});

test('recorrência reconhece assinaturas apesar de intervalo irregular, troca de conta e preço', () => {
  const payments = [
    transaction('adobe-jun', '2026-06-17', -5000, 'Débito PayPal *Adobe'),
    transaction('adobe-jul', '2026-07-20', -5000, 'Compra via NuPay Adobe'),
    transaction('adobe-aug', '2026-08-09', -5000, 'Compra via NuPay Adobe'),
    transaction('adobe-oct', '2026-10-25', 10000, 'PPRO Ouri Adobe', {account_id:'cartao', account_type:'CREDIT'}),
    transaction('spotify-jun', '2026-06-18', 2190, 'EBW*Spotify', {account_id:'cartao', account_type:'CREDIT'}),
    transaction('spotify-jul', '2026-07-20', 2190, 'EBW*Spotify', {account_id:'cartao', account_type:'CREDIT'}),
    transaction('spotify-sep', '2026-09-01', 2190, 'EBW*Spotify', {account_id:'cartao', account_type:'CREDIT'}),
    transaction('spotify-oct', '2026-10-19', 2190, 'Ebn *Spotify', {account_id:'cartao', account_type:'CREDIT'}),
    transaction('tax', '2026-10-25', 150, 'IOF de Adobe', {account_id:'cartao', account_type:'CREDIT'})
  ];
  const result = bankInsights(payments, '2026-11');
  assert.equal(result.recurring.length, 2);
  assert.equal(result.estimatedDueCents, 12190);
  assert.deepEqual(result.recurring.map(row => row.merchant), ['Spotify', 'Adobe']);
  assert.equal(result.recurring.find(row => row.merchant === 'Adobe').estimatedCents, 10000);
  assert.equal(result.recurring.find(row => row.merchant === 'Spotify').nextDue, '2026-11-19');
  assert.equal(bankInsights(payments, '2027-04').recurring.length, 0);
});

test('pagamentos isolados e comerciantes com múltiplas compras no mesmo mês não geram previsão', () => {
  const payments = [
    transaction('only', '2026-10-15', -1500, 'OpenAI ChatGPT'),
    transaction('netflix-one', '2026-09-15', -4000, 'Netflix'),
    transaction('netflix-two', '2026-10-03', -4000, 'Netflix'),
    transaction('netflix-extra', '2026-10-15', -4000, 'Netflix')
  ];
  assert.deepEqual(bankInsights(payments, '2026-11').recurring, []);
});
