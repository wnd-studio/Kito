import { createPluggyClient, hasPluggyCredentials, PluggyError } from './pluggy.mjs';
import { getBanking, markBankError, saveBankSync } from './hub.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const client = createPluggyClient();
let running = false;

function checkItem(item) {
  if (item.consentExpiresAt && Date.parse(item.consentExpiresAt) <= Date.now()) {
    throw new PluggyError('Autorização expirada. Renove pelo conector MeuPluggy no Dashboard.', 409);
  }
  if (['LOGIN_ERROR', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION', 'INVALID_CREDENTIALS'].includes(item.status)) {
    throw new PluggyError('Conexão precisa de autorização ou credenciais no Dashboard Pluggy.', 409);
  }
}

async function importItem(id, item, dateFrom, clientImpl = client) {
  checkItem(item);
  if (item.status !== 'UPDATED') {
    throw new PluggyError('Atualização da instituição ainda em andamento. Tente sincronizar após a conclusão.', 409);
  }
  const accounts = await clientImpl.getAccounts(id);
  const data = [];
  for (const account of accounts) {
    data.push({ account, transactions: await clientImpl.getTransactions(account.id, dateFrom) });
  }
  saveBankSync(id, item, data);
}

export function bankSnapshot(month) {
  return { configured: hasPluggyCredentials(), ...getBanking(month) };
}

export async function syncBanking() {
  if (running) throw new PluggyError('Uma sincronização já está em andamento.', 409);
  if (!hasPluggyCredentials()) throw new PluggyError('Configure as credenciais da aplicação Pluggy primeiro.', 422);
  const items = getBanking().items;
  if (!items.length) throw new PluggyError('Adicione um itemId da aplicação Pluggy antes de sincronizar.', 422);
  running = true;
  const failures = [];
  let synced = 0;
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 180);
  const dateFrom = from.toISOString().slice(0, 10);
  try {
    for (const {id} of items) {
      try {
        const item = await client.getItem(id);
        await importItem(id, item, dateFrom);
        synced++;
      } catch (error) {
        const message = error instanceof PluggyError ? error.message : 'Erro ao salvar os dados da conexão.';
        markBankError(id, message);
        failures.push({id, error: message});
      }
    }
  } finally {
    running = false;
  }
  return {synced, failures, importedFrom: dateFrom, ...bankSnapshot()};
}

export async function refreshBankItem(id, { clientImpl = client, delayImpl = delay } = {}) {
  if (running) throw new PluggyError('Uma sincronização já está em andamento.', 409);
  if (!hasPluggyCredentials()) throw new PluggyError('Configure as credenciais Pluggy primeiro.', 422);
  if (!getBanking().items.some(item => item.id === id)) throw new PluggyError('Conexão não cadastrada no Kito.', 404);
  running = true;
  try {
    const before = await clientImpl.getItem(id);
    checkItem(before);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 180);
    const dateFrom = from.toISOString().slice(0, 10);
    // MeuPluggy exposes proxy Items whose source is updated automatically.
    // PATCH cannot refresh a proxy, but querying its current data is supported.
    if (/^meu\s*pluggy$/i.test(String(before.connector?.name || '').trim())) {
      if (before.status !== 'UPDATED') {
        return { pending: true, message: 'O Meu Pluggy ainda está atualizando esta conexão. Consulte novamente mais tarde.' };
      }
      await importItem(id, before, dateFrom, clientImpl);
      return {
        pending: false, sourceUnchanged: true, sourceUpdatedAt: before.lastUpdatedAt,
        message: 'Dados disponíveis consultados. O Meu Pluggy atualiza a origem automaticamente, em geral a cada 24 horas.',
        ...bankSnapshot()
      };
    }
    await clientImpl.refreshItem(id);
    // A atualização na instituição é assíncrona. Importamos apenas após uma
    // atualização confirmada, evitando apresentar o cache antigo como novo.
    for (let attempt = 0; attempt < 12; attempt++) {
      await delayImpl(2000);
      const item = await clientImpl.getItem(id);
      checkItem(item);
      if (item.status === 'UPDATED' && item.lastUpdatedAt && item.lastUpdatedAt !== before.lastUpdatedAt) {
        await importItem(id, item, dateFrom, clientImpl);
        return { pending: false, sourceUpdatedAt: item.lastUpdatedAt, ...bankSnapshot() };
      }
    }
    return { pending: true, message: 'A instituição ainda está processando. Use Sincronizar depois para importar os novos dados.' };
  } finally {
    running = false;
  }
}
