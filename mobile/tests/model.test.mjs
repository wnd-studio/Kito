import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData, normalizeData, parseCents, money, safeUrl, billForMonth, totals, newEntry } from '../src/model.js';

test('estado inicial e restauração preservam os registros', () => {
  const state = initialData();
  newEntry(state, 'tasks', {title:'Concluir projeto', done:false});
  state.routineDays['2026-11-20:1'] = true;
  const restored = normalizeData(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.tasks[0].title, 'Concluir projeto');
  assert.equal(restored.nextId, 2);
  assert.equal(restored.routineDays['2026-11-20:1'], true);
  newEntry(restored,'tasks',{title:'Próxima',done:false});
  assert.equal(restored.tasks[0].id, 2);
});
test('backup inválido é rejeitado', () => {
  assert.throws(() => normalizeData({version:2}), /incompatível/);
  assert.throws(() => normalizeData({...initialData(), tasks:'inválido'}), /inválidos/);
  assert.throws(() => normalizeData({...initialData(), tasks:[{id:0}]}), /Identificador/);
});
test('valores em reais e centavos são convertidos sem perda monetária', () => {
  assert.equal(parseCents('R$ 1.234,56'), 123456);
  assert.equal(parseCents('12.99'), 1299);
  assert.equal(parseCents('0,01'), 1);
  assert.equal(money(123456), 'R$ 1.234,56');
  assert.throws(() => parseCents('0,00'));
  assert.throws(() => parseCents('-50'));
  assert.throws(() => parseCents('coisa'));
});
test('links limitados a HTTP e HTTPS', () => {
  assert.equal(safeUrl('https://example.com/vaga'), 'https://example.com/vaga');
  assert.throws(() => safeUrl('javascript:alert(1)'));
  assert.throws(() => safeUrl('file:///etc/passwd'));
});
test('conta mensal adapta o dia ao último dia do mês', () => {
  const bill = {id:5, title:'Aluguel', due_on:'2026-01-31', repeat:true};
  assert.equal(billForMonth(bill,'2026-02').due_on, '2026-02-28');
  assert.equal(billForMonth(bill,'2026-03').due_on, '2026-03-31');
  assert.equal(billForMonth(bill,'2025-12'), null);
});
test('saldo mensal contabiliza entradas e saídas do mês correto', () => {
  const state = initialData();
  newEntry(state,'transactions',{occurred_on:'2026-11-20',type:'income',amount_cents:50000});
  newEntry(state,'transactions',{occurred_on:'2026-11-19',type:'expense',amount_cents:1050});
  newEntry(state,'transactions',{occurred_on:'2026-10-01',type:'expense',amount_cents:9999});
  assert.deepEqual(totals(state,'2026-11'),{income:50000,expense:1050});
});
