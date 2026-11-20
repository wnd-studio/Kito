import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(tmpdir(), 'wnd-central-gmail-auth-'));
process.env.VAGAS_DB_PATH = join(folder, 'test.sqlite');
const core = await import('../core.mjs');
const { GmailService, makeMime } = await import('../gmail.mjs');
const testAccount = 'test-user@example.com';

const clientId = '123456789-test.apps.googleusercontent.com';
const clientSecret = 'test-client-secret';
const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send'
];

function createService({ openBrowser, fetcher, initialSettings = { clientId, clientSecret } }) {
  let settings = { ...initialSettings };
  const service = new GmailService({
    readSettings: () => settings,
    writeSettings: value => { settings = value; },
    openBrowser,
    fetcher,
    authTimeoutMs: 5000
  });
  return { service, settings: () => settings };
}

function callbackUrl(authUrl, { state, code = 'authorization-code', error } = {}) {
  const authorization = new URL(authUrl);
  const callback = new URL(authorization.searchParams.get('redirect_uri'));
  callback.searchParams.set('state', state || authorization.searchParams.get('state'));
  if (code) callback.searchParams.set('code', code);
  if (error) callback.searchParams.set('error', error);
  return callback;
}

async function completeAuthorization(authUrl, options) {
  return fetch(callbackUrl(authUrl, options));
}

function successfulFetcher(expectedCode) {
  return async (url, options = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const fields = new URLSearchParams(options.body);
      assert.equal(fields.get('client_secret'), clientSecret);
      if (expectedCode) assert.equal(fields.get('code'), expectedCode);
      return {
        ok: true,
        async json() {
          return {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: scopes.join(' ')
          };
        }
      };
    }
    if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/profile') {
      return { ok: true, async json() { return { emailAddress: testAccount }; } };
    }
    throw Error(`Requisição inesperada no teste: ${url}`);
  };
}

after(() => {
  core.close();
  rmSync(folder, { recursive: true, force: true });
});

test('OAuth conclui a conexão com respostas simuladas', async () => {
  const { service, settings } = createService({
    openBrowser: async authUrl => {
      const response = await completeAuthorization(authUrl);
      assert.equal(response.status, 200);
    },
    fetcher: successfulFetcher('authorization-code')
  });

  const status = await service.connect();
  assert.equal(status.connected, true);
  assert.equal(status.connecting, false);
  assert.equal(status.credentialsReady, true);
  assert.equal(settings().clientSecret, clientSecret);
  assert.equal(settings().refreshToken, 'test-refresh-token');
  assert.equal(settings().email, testAccount);
});

test('mensagens identificam corretamente a conta autorizada', () => {
  const raw = makeMime({ from: 'another-user@example.org', to: 'recruiter@example.org',
    subject: 'Candidatura', body: 'Tenho interesse.' });
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /^From: another-user@example\.org$/m);
  assert.match(mime, /^To: recruiter@example\.org$/m);
  assert.throws(() => makeMime({ to: 'recruiter@example.org', subject: 'Olá', body: 'Teste' }), /Endereço de e-mail inválido/);
});

test('Client Secret é obrigatório, fica salvo e é preservado ao desconectar', () => {
  const { service, settings } = createService({
    openBrowser: async () => {},
    fetcher: successfulFetcher(),
    initialSettings: { clientId }
  });

  assert.equal(service.status().credentialsReady, false);
  assert.throws(() => service.configure('', ''), /Client Secret/);

  const status = service.configure('', clientSecret);
  assert.equal(status.credentialsReady, true);
  assert.equal(settings().clientId, clientId);
  assert.equal(settings().clientSecret, clientSecret);

  service.disconnect();
  assert.equal(settings().clientSecret, clientSecret);
});

test('renovação do token também envia o Client Secret', async () => {
  let tokenFields;
  const { service } = createService({
    openBrowser: async () => {},
    fetcher: async (url, options = {}) => {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      tokenFields = new URLSearchParams(options.body);
      return { ok: true, async json() { return { access_token: 'renewed-access-token', expires_in: 3600 }; } };
    },
    initialSettings: { clientId, clientSecret, refreshToken: 'test-refresh-token' }
  });

  assert.equal(await service.token(true), 'renewed-access-token');
  assert.equal(tokenFields.get('client_secret'), clientSecret);
  assert.equal(tokenFields.get('grant_type'), 'refresh_token');
});

test('falha OAuth libera o estado e permite uma nova tentativa', async () => {
  let failTokenExchange = true;
  let authorizationNumber = 0;
  const { service } = createService({
    openBrowser: async authUrl => {
      authorizationNumber++;
      const response = await completeAuthorization(authUrl, { code: `authorization-${authorizationNumber}` });
      assert.equal(response.status, 200);
    },
    fetcher: async (url, options = {}) => {
      if (url === 'https://oauth2.googleapis.com/token' && failTokenExchange) {
        return { ok: false, async json() { return { error_description: 'Client OAuth de teste recusado.' }; } };
      }
      return successfulFetcher('authorization-2')(url, options);
    }
  });

  await assert.rejects(service.connect(), /Client OAuth de teste recusado/);
  assert.equal(service.status().connecting, false);
  assert.match(service.status().error, /Client OAuth de teste recusado/);

  failTokenExchange = false;
  const status = await service.connect();
  assert.equal(status.connected, true);
  assert.equal(status.connecting, false);
});

test('cancelamento encerra a sessão e callback atrasado não interrompe a próxima tentativa', async () => {
  let firstAuthUrl;
  let secondAuthUrl;
  let resolveFirst;
  let resolveSecond;
  const firstOpened = new Promise(resolve => { resolveFirst = resolve; });
  const secondOpened = new Promise(resolve => { resolveSecond = resolve; });
  let opened = 0;
  const { service } = createService({
    openBrowser: async authUrl => {
      opened++;
      if (opened === 1) {
        firstAuthUrl = authUrl;
        resolveFirst();
      } else {
        secondAuthUrl = authUrl;
        resolveSecond();
      }
    },
    fetcher: successfulFetcher('second-attempt-code')
  });

  const firstAttempt = service.connect();
  await firstOpened;
  assert.equal(service.status().connecting, true);

  const cancelled = service.cancelConnect();
  assert.equal(cancelled.connecting, false);
  assert.match(cancelled.error, /Autorização cancelada/);
  await assert.rejects(firstAttempt, /Autorização cancelada/);

  const secondAttempt = service.connect();
  await secondOpened;

  const firstState = new URL(firstAuthUrl).searchParams.get('state');
  const staleResponse = await fetch(callbackUrl(secondAuthUrl, { state: firstState, code: 'late-code' }));
  assert.equal(staleResponse.status, 400);
  assert.equal(service.status().connecting, true);

  const validResponse = await completeAuthorization(secondAuthUrl, { code: 'second-attempt-code' });
  assert.equal(validResponse.status, 200);
  const status = await secondAttempt;
  assert.equal(status.connected, true);
  assert.equal(status.connecting, false);
});
