// O cliente da API fica exclusivamente no processo Node/Electron.
const API_ROOT = 'https://api.pluggy.ai';
let credentialsProvider = () => ({
  clientId: process.env.PLUGGY_CLIENT_ID,
  clientSecret: process.env.PLUGGY_CLIENT_SECRET
});
let credentialsRevision = 0;

export function setPluggyCredentialsProvider(provider) {
  credentialsProvider = provider;
  credentialsRevision++;
}

export function hasPluggyCredentials() {
  const { clientId, clientSecret } = credentialsProvider() || {};
  return Boolean(clientId && clientSecret);
}

export class PluggyError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'PluggyError';
    this.status = status;
  }
}

export function createPluggyClient({ fetchImpl = fetch, baseUrl = API_ROOT, getCredentials = () => credentialsProvider() } = {}) {
  let session;
  let revision = credentialsRevision;
  const request = async (path, options = {}, authenticated = true, retry = true) => {
    const headers = { Accept: 'application/json', ...options.headers };
    if (authenticated) headers['X-API-KEY'] = await authenticate();
    let response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        ...options,
        headers,
        signal: AbortSignal.timeout(25000),
        redirect: 'error'
      });
    } catch {
      throw new PluggyError('Não foi possível comunicar com o Pluggy. Verifique sua conexão.');
    }
    if (response.status === 401 && authenticated && retry) {
      session = undefined;
      return request(path, options, authenticated, false);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new PluggyError('Acesso negado pelo Pluggy. Confira as credenciais e a autorização da aplicação.', 401);
      if (response.status === 404) throw new PluggyError('A conexão não foi encontrada nessa aplicação Pluggy.', 404);
      if (response.status === 429) throw new PluggyError('Limite de consultas do Pluggy atingido. Tente novamente mais tarde.', 429);
      throw new PluggyError('O Pluggy não conseguiu concluir a consulta. Tente novamente mais tarde.');
    }
    try { return await response.json(); }
    catch { throw new PluggyError('O Pluggy retornou uma resposta inválida.'); }
  };

  async function authenticate() {
    if (revision !== credentialsRevision) { session = undefined; revision = credentialsRevision; }
    if (session && Date.now() < session.expiresAt) return session.key;
    const { clientId, clientSecret } = getCredentials() || {};
    if (!clientId || !clientSecret) throw new PluggyError('Configure o Client ID e o Client Secret do Pluggy primeiro.', 422);
    const result = await request('/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    }, false);
    if (typeof result.apiKey !== 'string' || !result.apiKey) throw new PluggyError('O Pluggy não retornou uma chave de acesso válida.');
    session = { key: result.apiKey, expiresAt: Date.now() + 110 * 60_000 };
    return session.key;
  }

  async function listCursor(path) {
    const records = [];
    let next = path;
    const cursors = new Set();
    for (let page = 0; next && page < 50; page++) {
      const url = new URL(next.startsWith('?') ? `/v2/transactions${next}` : next, baseUrl);
      const expected = new URL(path, baseUrl);
      if (url.origin !== expected.origin || url.pathname !== expected.pathname ||
          url.searchParams.get('accountId') !== expected.searchParams.get('accountId') || cursors.has(url.href)) {
        throw new PluggyError('A paginação de transações retornou um endereço inválido.');
      }
      cursors.add(url.href);
      const data = await request(url.pathname + url.search);
      if (!Array.isArray(data.results)) throw new PluggyError('Lista inválida retornada pelo Pluggy.');
      records.push(...data.results);
      next = data.next ? (data.next.startsWith('?') ? url.pathname + data.next : data.next) : null;
    }
    if (next) throw new PluggyError('A consulta superou o limite de páginas.');
    return records;
  }

  async function listAccounts(itemId) {
    const records = [];
    for (let page = 1; page <= 50; page++) {
      const data = await request(`/accounts?itemId=${encodeURIComponent(itemId)}&page=${page}`);
      if (!Array.isArray(data.results) || !Number.isSafeInteger(data.totalPages) ||
          data.totalPages < 0 || data.totalPages > 50) {
        throw new PluggyError('O Pluggy retornou uma lista de contas inválida.');
      }
      records.push(...data.results);
      if (page >= data.totalPages) return records;
    }
    throw new PluggyError('A lista de contas excedeu o limite de páginas.');
  }

  return {
    getItem: itemId => request(`/items/${encodeURIComponent(itemId)}`),
    getAccounts: itemId => listAccounts(itemId),
    getTransactions: (accountId, dateFrom) => listCursor(`/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`)
  };
}
