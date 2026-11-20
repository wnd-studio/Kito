import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPluggyClient, PluggyError } from '../pluggy.mjs';

const itemId = 'b315ae8f-e47c-4499-9f6b-7e1b19613910';
const accountId = '932a021e-dd86-4ee2-959c-5e26e94f8152';
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});

test('Pluggy autentica e importa contas paginadas e transações com cursor', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const path = url.pathname + url.search;
    requests.push({ path, options });
    if (path === '/auth') return response({ apiKey: 'mock-key' });
    assert.equal(options.headers['X-API-KEY'], 'mock-key');
    if (path === `/items/${itemId}`) return response({ id: itemId, status: 'UPDATED' });
    if (path === `/accounts?itemId=${itemId}&page=1`) {
      return response({ results: [{ id: accountId, itemId }], totalPages: 2 });
    }
    if (path === `/accounts?itemId=${itemId}&page=2`) {
      return response({ results: [], totalPages: 2 });
    }
    if (path === `/v2/transactions?accountId=${accountId}&dateFrom=2026-05-01`) {
      return response({ results: [{ id: 't1' }], next: `?accountId=${accountId}&after=cursor1` });
    }
    if (path === `/v2/transactions?accountId=${accountId}&after=cursor1`) {
      return response({ results: [{ id: 't2' }], next: null });
    }
    throw Error(`Requisição inesperada: ${path}`);
  };
  const client = createPluggyClient({ fetchImpl, getCredentials: () => ({ clientId: 'id', clientSecret: 'secret' }) });
  assert.equal((await client.getItem(itemId)).id, itemId);
  assert.equal((await client.getAccounts(itemId)).length, 1);
  assert.deepEqual((await client.getTransactions(accountId, '2026-05-01')).map(t => t.id), ['t1', 't2']);
  assert.equal(requests.filter(r => r.path === '/auth').length, 1);
  assert.equal(JSON.parse(requests[0].options.body).clientSecret, 'secret');
});

test('Pluggy rejeita paginação de outra conta antes de chamar a URL', async () => {
  let externalRequested = false;
  const fetchImpl = async url => {
    if (url.pathname === '/auth') return response({ apiKey: 'mock-key' });
    if (url.pathname === '/v2/transactions') {
      if (url.searchParams.get('accountId') !== accountId) externalRequested = true;
      return response({ results: [], next: '?accountId=another-account&after=cursor' });
    }
    throw Error('Requisição não esperada');
  };
  const client = createPluggyClient({ fetchImpl, getCredentials: () => ({ clientId: 'id', clientSecret: 'secret' }) });
  await assert.rejects(client.getTransactions(accountId, '2026-05-01'), PluggyError);
  assert.equal(externalRequested, false);
});
