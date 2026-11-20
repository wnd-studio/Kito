import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Toda a integração usa um Gmail simulado e um banco temporário.
// Nenhuma requisição externa ou candidatura real é enviada.
const folder = mkdtempSync(join(tmpdir(), 'wnd-central-mail-'));
process.env.VAGAS_DB_PATH = join(folder, 'test.sqlite');
process.env.VAGAS_PORT = '0';

const core = await import('../core.mjs');
const hub = await import('../hub.mjs');
const { server, serverReady, setGmailService } = await import('../server.mjs');
const base = await serverReady;
const response = await fetch(base);
const html = await response.text();
const csrf = html.match(/name="csrf-token" content="([^"]+)"/)?.[1];
assert.ok(csrf);

const fake = {
  account: 'test-user@example.com',
  authorized: false,
  failVerify: false,
  mode: 'confirmed',
  alertMode: 'confirmed',
  sends: 0,
  alertSends: 0,
  sent: null,
  sentByMessageId: new Map(),
  status() {
    return { configured: true, authorized: this.authorized,
      connected: this.authorized && !this.failVerify, email: this.account, expectedEmail: this.account };
  },
  async verifyConnection() {
    if (this.failVerify) throw Error('Gmail temporariamente indisponível');
    return true;
  },
  async request(path, options) {
    assert.equal(path, '/messages/send');
    assert.equal(options.method, 'POST');
    const raw = Buffer.from(options.body.raw, 'base64url').toString('utf8');
    const isAlert = raw.includes(`To: ${this.account}\r\n`);
    if (isAlert) this.alertSends++;
    else this.sends++;
    if ((isAlert ? this.alertMode : this.mode) === 'reject') {
      const error = Error('Destinatário recusado pelo Gmail');
      error.status = 400;
      throw error;
    }
    const messageId = raw.match(/^Message-ID: (.+)$/m)?.[1]?.trim();
    assert.ok(messageId, 'Toda candidatura precisa de um Message-ID próprio');
    this.sent = isAlert ? {id:`alert${this.alertSends}mock`,threadId:`alertthread${this.alertSends}mock`}
      : { id: `sent${this.sends}mock`, threadId: `thread${this.sends}mock` };
    this.sentByMessageId.set(messageId, this.sent);
    if ((isAlert ? this.alertMode : this.mode) === 'ambiguous') throw Error('Conexão encerrada após envio');
    return this.sent;
  },
  async findSentByMessageId(messageId) { return this.sentByMessageId.get(messageId) || null; },
  async getThread(id) {
    const sent = [...this.sentByMessageId.values()].find(message => message.threadId === id);
    return { id, messages: [{ id: sent?.id || '', from: this.account }] };
  }
};
setGmailService(fake);

const post = async (path, data = {}) => {
  const res = await fetch(base + path, { method: 'POST', headers: {
    Origin: base, 'Content-Type': 'application/json', 'x-csrf-token': csrf
  }, body: JSON.stringify(data) });
  return { status: res.status, body: await res.json() };
};

let jobNumber = 0;
function newJob(channel = 'email') {
  const index = ++jobNumber;
  return core.ingest({
    company: `Empresa de Teste ${index}`, title: 'Motion Designer',
    source_url: `https://example.org/careers/${index}`, application_url: `https://example.org/apply/${index}`,
    channel, recipient: 'rh@example.org', subject: 'Candidatura Motion Designer',
    cover_letter: 'Olá, envio minha candidatura à vaga de Motion Designer.',
    verification: { status: 'verified', checked_at: new Date().toISOString(), notes: 'Fonte de teste simulada.' }
  }).id;
}

after(async () => {
  await new Promise(resolve => server.close(resolve));
  hub.closeHub();
  core.close();
  rmSync(folder, { recursive: true, force: true });
});

test('nunca envia uma candidatura sem aprovação individual', async () => {
  const id = newJob();
  fake.authorized = true;
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(core.get(id).status, 'pending_review');
  assert.equal(fake.sends, 0);
});

test('aprovação offline fica na fila e envia uma única vez quando o Gmail retorna', async () => {
  fake.authorized = false;
  const id = newJob();
  const approved = await post(`/api/opportunities/${id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.item.status, 'approved');
  assert.equal((await (await fetch(base + '/api/mail/status')).json()).pending, 1);
  assert.equal(fake.sends, 0);

  fake.authorized = true;
  fake.failVerify = true;
  const idWithError = newJob();
  const deferred = await post(`/api/opportunities/${idWithError}/approve`);
  assert.equal(deferred.status, 200);
  assert.equal(deferred.body.item.status, 'approved');
  assert.match(deferred.body.message, /aguardando o Gmail/);
  assert.equal(fake.sends, 0);

  fake.failVerify = false;
  const result = await post('/api/mail/sync');
  assert.equal(result.status, 200);
  assert.equal(core.get(id).status, 'submitted');
  assert.equal(core.get(idWithError).status, 'submitted');
  assert.equal(fake.sends, 2);
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(fake.sends, 2);
});

test('aprovação com Gmail disponível envia imediatamente e formulário mantém link externo', async () => {
  const emailId = newJob();
  const before = fake.sends;
  const email = await post(`/api/opportunities/${emailId}/approve`);
  assert.equal(email.status, 200);
  assert.equal(email.body.item.status, 'submitted');
  assert.equal(fake.sends, before + 1);

  const formId = newJob('form');
  const form = await post(`/api/opportunities/${formId}/approve`);
  assert.equal(form.status, 200);
  assert.equal(form.body.item.status, 'needs_action');
  assert.equal(fake.sends, before + 1);
});

test('resposta ambígua é conciliada por Message-ID sem duplicar envio', async () => {
  fake.mode = 'ambiguous';
  const id = newJob();
  const before = fake.sends;
  const result = await post(`/api/opportunities/${id}/approve`);
  assert.equal(result.status, 200);
  assert.equal(result.body.item.status, 'submitting');
  assert.equal(fake.sends, before + 1);

  fake.mode = 'confirmed';
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(core.get(id).status, 'submitted');
  assert.equal(fake.sends, before + 1);
});

test('concilia duas mensagens incertas por seus próprios IDs, sem reenviar', async () => {
  fake.mode = 'ambiguous';
  const firstId = newJob();
  const secondId = newJob();
  const before = fake.sends;
  await post(`/api/opportunities/${firstId}/approve`);
  await post(`/api/opportunities/${secondId}/approve`);
  assert.equal(core.get(firstId).status, 'submitting');
  assert.equal(core.get(secondId).status, 'submitting');
  assert.notEqual(core.get(firstId).outgoing_message_id, core.get(secondId).outgoing_message_id);
  fake.mode = 'confirmed';
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(core.get(firstId).status, 'submitted');
  assert.equal(core.get(secondId).status, 'submitted');
  assert.equal(fake.sends, before + 2);
});

test('envio incerto sem correspondência permanece reservado e nunca é repetido', async () => {
  fake.mode = 'ambiguous';
  const id = newJob();
  await post(`/api/opportunities/${id}/approve`);
  assert.equal(core.get(id).status, 'submitting');
  fake.sentByMessageId.delete(core.get(id).outgoing_message_id);
  const before = fake.sends;
  fake.mode = 'confirmed';
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(core.get(id).status, 'submitting');
  assert.equal(fake.sends, before);
});

test('erro permanente do Gmail informa falha sem reenviar automaticamente', async () => {
  fake.mode = 'reject';
  const id = newJob();
  const result = await post(`/api/opportunities/${id}/approve`);
  assert.equal(result.status, 200);
  assert.equal(result.body.item.status, 'failed');
  assert.match(result.body.message, /recusou o envio/i);
  const before = fake.sends;
  fake.mode = 'confirmed';
  await post('/api/mail/sync');
  assert.equal(core.get(id).status, 'failed');
  assert.equal(fake.sends, before);
});

test('cada vaga verificada gera um único aviso para o próprio e-mail sem candidatura', async () => {
  fake.authorized = true;
  const id = newJob('form');
  const before = fake.alertSends;
  const sentBefore = fake.sends;
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(fake.alertSends, before + 1);
  assert.equal(fake.sends, sentBefore);
  assert.ok(core.get(id).notified_at);
  assert.equal((await post('/api/mail/sync')).status, 200);
  assert.equal(fake.alertSends, before + 1);
});

test('aviso incerto é conciliado pelo Message-ID antes de qualquer reenvio', async () => {
  fake.authorized = true;
  fake.alertMode = 'ambiguous';
  const id = newJob('form');
  const before = fake.alertSends;
  await post('/api/mail/sync');
  assert.equal(fake.alertSends, before + 1);
  assert.equal(core.get(id).notified_at, null);
  assert.ok(core.unresolvedJobAlerts().some(alert => alert.opportunity_id === id));
  fake.alertMode = 'confirmed';
  await post('/api/mail/sync');
  assert.equal(fake.alertSends, before + 1);
  assert.ok(core.get(id).notified_at);
});

test('aviso recusado pelo Gmail registra a falha sem novas tentativas', async () => {
  fake.authorized = true;
  fake.alertMode = 'reject';
  const id = newJob('form');
  const before = fake.alertSends;
  await post('/api/mail/sync');
  assert.equal(fake.alertSends, before + 1);
  assert.equal(core.get(id).notified_at, null);
  fake.alertMode = 'confirmed';
  await post('/api/mail/sync');
  assert.equal(fake.alertSends, before + 1);
  assert.ok(core.jobAlertStats().failed >= 1);
});
