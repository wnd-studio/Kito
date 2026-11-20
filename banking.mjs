import { createPluggyClient, hasPluggyCredentials, PluggyError } from './pluggy.mjs';
import { getBanking, markBankError, saveBankSync } from './hub.mjs';

const client = createPluggyClient();
let running = false;

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
        if (item.consentExpiresAt && Date.parse(item.consentExpiresAt) <= Date.now()) {
          throw new PluggyError('Autorização expirada. Renove pelo conector MeuPluggy no Dashboard.', 409);
        }
        if (item.status === 'LOGIN_ERROR' || item.status === 'WAITING_USER_INPUT') {
          throw new PluggyError('Conexão exige atenção no Dashboard do Pluggy.', 409);
        }
        if (item.status !== 'UPDATED') {
          throw new PluggyError('A conexão ainda não concluiu a atualização no Pluggy. Tente novamente após a conclusão.', 409);
        }
        const accounts = await client.getAccounts(id);
        const data = [];
        for (const account of accounts) {
          data.push({account, transactions: await client.getTransactions(account.id, dateFrom)});
        }
        saveBankSync(id, item, data);
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
