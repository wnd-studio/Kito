import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { claimSubmission, get, linkMail, transition, uncertainMailSubmissions,
  claimJobAlert, markJobAlertSent, failJobAlert, unresolvedJobAlerts } from './core.mjs';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_ATTACHMENT = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const AUTH_TIMEOUT_MS = 3 * 60_000;

const encodeHeader = value => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
const encodeBody = value => Buffer.from(value, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();
const safeAddress = value => {
  const address = String(value || '').trim();
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(address) || /[\r\n]/.test(address)) {
    throw Error('Endereço de e-mail inválido.');
  }
  return address;
};
const header = (message, name) => message?.payload?.headers?.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || '';
const addressFrom = text => {
  const match = String(text).match(/<([^<>]+)>/);
  return safeAddress(match ? match[1] : text);
};
const decodeBase64Url = value => Buffer.from(value || '', 'base64url').toString('utf8');

function plainBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts || []) {
    const content = plainBody(part);
    if (content) return content;
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return '';
}

export function simplifyMessage(message) {
  return {
    id: message.id,
    threadId: message.threadId,
    from: header(message, 'From'),
    to: header(message, 'To'),
    replyTo: header(message, 'Reply-To'),
    subject: header(message, 'Subject'),
    messageId: header(message, 'Message-ID'),
    references: header(message, 'References'),
    date: Number(message.internalDate || 0),
    unread: Boolean(message.labelIds?.includes('UNREAD')),
    body: plainBody(message.payload).slice(0, 30000) || message.snippet || '',
    snippet: message.snippet || ''
  };
}

export function makeMime({ from, to, subject, body, inReplyTo = '', references = '', attachment = null, messageId = '' }) {
  const sender = safeAddress(from);
  const recipient = safeAddress(to);
  if (!subject?.trim() || /[\r\n]/.test(subject)) throw Error('Informe um assunto válido.');
  if (!body?.trim()) throw Error('Escreva a mensagem antes de enviar.');
  const lines = [
    `From: ${sender}`,
    `To: ${recipient}`,
    `Subject: ${encodeHeader(subject.trim())}`,
    'MIME-Version: 1.0'
  ];
  if (messageId) {
    if (!/^<wnd\.(?:alert\.)?[a-f0-9]{20}\.[a-f0-9]{16}@wnd\.net\.br>$/.test(messageId)) throw Error('ID de saída inválido.');
    lines.push(`Message-ID: ${messageId}`);
  }
  if (inReplyTo) {
    if (!/^<[^\r\n<>]+>$/.test(inReplyTo)) throw Error('ID de mensagem inválido.');
    lines.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    if (/[\r\n]/.test(references)) throw Error('Referência inválida.');
    lines.push(`References: ${references.slice(0, 900)}`);
  }
  if (attachment) {
    const boundary = `wnd-${randomBytes(16).toString('hex')}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', encodeBody(body), '',
      `--${boundary}`,
      `Content-Type: ${attachment.mime}; name="${attachment.name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.name}"`, '',
      attachment.bytes.toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd(), '',
      `--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', encodeBody(body));
  }
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export function readAttachment(path) {
  if (!path) return null;
  if (!existsSync(path)) throw Error('O currículo indicado não existe neste computador.');
  const extension = extname(path).toLowerCase();
  const types = { '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (!types[extension]) throw Error('O currículo precisa ser um PDF, DOC ou DOCX.');
  if (statSync(path).size > MAX_ATTACHMENT) throw Error('O currículo excede 12 MB.');
  // O nome MIME é ASCII para interoperar com serviços de e-mail. O arquivo original não muda.
  const stem = basename(path, extension).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100);
  const name = `${stem || 'curriculo'}${extension}`;
  return { name, mime: types[extension], bytes: readFileSync(path) };
}

export class GmailService {
  constructor({ readSettings, writeSettings, openBrowser, fetcher = fetch, authTimeoutMs = AUTH_TIMEOUT_MS }) {
    this.readSettings = readSettings;
    this.writeSettings = writeSettings;
    this.openBrowser = openBrowser;
    this.fetcher = fetcher;
    this.accessToken = null;
    this.expiresAt = 0;
    this.refreshPromise = null;
    this.connecting = false;
    this.authSession = null;
    this.authTimeoutMs = authTimeoutMs;
    this.connectError = '';
    this.verifiedAt = 0;
    this.authError = '';
    this.verificationError = '';
  }

  settings() { return this.readSettings() || {}; }
  status() {
    const data = this.settings();
    const credentialsReady = Boolean(data.clientId && data.clientSecret);
    const authorized = Boolean(credentialsReady && data.refreshToken && data.email && !this.authError);
    return { configured: Boolean(data.clientId), credentialsReady, authorized,
      connected: Boolean(authorized && this.verifiedAt && !this.verificationError),
      verified: Boolean(this.verifiedAt), verifiedAt: this.verifiedAt || null,
      reauthorizationRequired: Boolean(this.authError),
      connecting: Boolean(this.authSession),
      error: this.authError || this.connectError || this.verificationError,
      email: data.email || '', expectedEmail: data.email || '' };
  }

  configure(clientId, clientSecret) {
    if (this.authSession) throw Error('Cancele a autorização em andamento antes de alterar o Client ID.');
    const existing = this.settings();
    const requestedId = String(clientId || '').trim();
    const id = requestedId || existing.clientId || '';
    if (!/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id) || id.length > 220) {
      throw Error('Informe o Client ID do OAuth criado como Aplicativo para computador no Google Cloud.');
    }
    const suppliedSecret = String(clientSecret || '').trim();
    const secret = suppliedSecret || (existing.clientId === id ? existing.clientSecret : '');
    if (!secret || secret.length > 512) {
      throw Error('Informe o Client Secret gerado para esse cliente OAuth no Google Cloud.');
    }
    const clientChanged = existing.clientId !== id;
    const secretChanged = existing.clientSecret !== secret;
    this.writeSettings(clientChanged ? { clientId:id, clientSecret:secret } : { ...existing, clientId:id, clientSecret:secret });
    if (clientChanged) { this.accessToken = null; this.expiresAt = 0; this.verifiedAt = 0; this.authError = ''; this.verificationError = ''; this.connectError = ''; }
    else if (secretChanged) { this.accessToken = null; this.expiresAt = 0; }
    return this.status();
  }

  disconnect() {
    this.cancelConnect();
    this.accessToken = null;
    this.expiresAt = 0;
    this.verifiedAt = 0;
    this.authError = '';
    this.verificationError = '';
    this.connectError = '';
    const data = this.settings();
    this.writeSettings(data.clientId ? { clientId: data.clientId, clientSecret: data.clientSecret } : {});
    return this.status();
  }

  async connect() {
    if (this.authSession) throw Error('A autorização do Gmail já está em andamento. Cancele a tentativa atual para começar outra.');
    const { clientId, clientSecret } = this.settings();
    if (!clientId) throw Error('Configure o Client ID antes de conectar a conta Gmail.');
    if (!clientSecret) throw Error('Informe o Client Secret do Google OAuth na configuração do Gmail.');
    const session = { cancelled: false, abort: new AbortController(), rejectWait: null, timer: null, close: null };
    this.authSession = session;
    this.connecting = true;
    this.connectError = '';
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(24).toString('base64url');
    let server;
    try {
      const code = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve(value);
        };
        session.rejectWait = error => finish(error);
        session.timer = setTimeout(() => finish(Error('A autorização do Google expirou. Tente novamente.')), this.authTimeoutMs);
        server = createServer((req, res) => {
          const url = new URL(req.url, 'http://127.0.0.1');
          if (url.pathname !== '/oauth/callback') { res.writeHead(404).end(); return; }
          if (session.cancelled) {
            res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end('<p>Esta tentativa de autorização foi cancelada. Retorne ao Kito.</p>');
            return;
          }
          const valid = url.searchParams.get('state') === state;
          if (!valid) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end('<p>Resposta OAuth inválida. Retorne ao Kito e tente novamente.</p>');
            return;
          }
          const error = url.searchParams.get('error');
          const result = url.searchParams.get('code');
          res.writeHead(error || !result ? 400 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(error || !result ? '<p>Autorização recusada. Retorne ao Kito.</p>' : '<p>Gmail autorizado. Volte para o Kito.</p>');
          if (error || !result) { finish(Error('Autorização do Google cancelada ou recusada.')); return; }
          finish(null, result);
        });
        session.close = () => {
          if (!server.listening) return;
          server.closeAllConnections?.();
          server.close();
        };
        server.once('error', finish);
        server.listen(0, '127.0.0.1', () => {
          const redirectUri = `http://127.0.0.1:${server.address().port}/oauth/callback`;
          const authUrl = new URL(AUTH_URL);
          for (const [key, value] of Object.entries({client_id:clientId, redirect_uri:redirectUri, response_type:'code',
            scope:SCOPES.join(' '), code_challenge:challenge, code_challenge_method:'S256', state,
            access_type:'offline', prompt:'consent' })) authUrl.searchParams.set(key, value);
          try { Promise.resolve(this.openBrowser(authUrl.toString())).catch(finish); }
          catch (error) { finish(error); }
        });
      });
      if (session.cancelled) throw Error('Autorização cancelada.');
      const redirectUri = `http://127.0.0.1:${server.address().port}/oauth/callback`;
      const tokens = await this.exchangeToken({ client_id:clientId, client_secret:clientSecret, code, redirect_uri:redirectUri, code_verifier:verifier, grant_type:'authorization_code' }, session.abort.signal);
      if (session.cancelled) throw Error('Autorização cancelada.');
      if (!tokens.refresh_token || !SCOPES.every(scope => String(tokens.scope || '').split(' ').includes(scope))) {
        throw Error('O Google não concedeu todas as permissões ou o acesso offline. Tente conectar novamente.');
      }
      const profileResponse = await this.fetcher(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.any([session.abort.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      });
      if (!profileResponse.ok) throw Error('Não foi possível verificar a conta Gmail autorizada.');
      const profile = await profileResponse.json();
      if (session.cancelled) throw Error('Autorização cancelada.');
      const accountEmail = safeAddress(profile.emailAddress).toLowerCase();
      this.accessToken = tokens.access_token;
      this.expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
      this.writeSettings({ ...this.settings(), clientId, clientSecret, refreshToken:tokens.refresh_token, email:accountEmail });
      this.verifiedAt = Date.now();
      this.authError = '';
      this.verificationError = '';
      this.connectError = '';
      if (this.authSession === session) { this.authSession = null; this.connecting = false; }
      return this.status();
    } catch (error) {
      if (this.authSession === session) this.connectError = session.cancelled ? 'Autorização cancelada. Você pode tentar novamente.' : error.message;
      throw error;
    } finally {
      clearTimeout(session.timer);
      if (this.authSession === session) { this.authSession = null; this.connecting = false; }
      session.close?.();
    }
  }

  cancelConnect() {
    const session = this.authSession;
    if (!session) return this.status();
    session.cancelled = true;
    this.authSession = null;
    this.connecting = false;
    this.connectError = 'Autorização cancelada. Você pode tentar novamente.';
    session.abort.abort();
    session.rejectWait?.(Error('Autorização cancelada.'));
    session.close?.();
    return this.status();
  }

  async exchangeToken(fields, signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)) {
    const response = await this.fetcher(TOKEN_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams(fields), signal:AbortSignal.any([signal,AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) });
    const data = await response.json();
    if (!response.ok) throw Error(`Google OAuth: ${data.error_description || data.error || 'falha na autorização'}`);
    return data;
  }

  async token(force = false) {
    if (!force && this.accessToken && Date.now() < this.expiresAt - 60000) return this.accessToken;
    if (this.refreshPromise) return this.refreshPromise;
    const { clientId, clientSecret, refreshToken } = this.settings();
    if (!clientId || !refreshToken) throw Error('Conecte sua conta Gmail na aba Correio.');
    if (!clientSecret) throw Error('Informe o Client Secret do Google OAuth na configuração do Gmail.');
    this.refreshPromise = this.exchangeToken({ client_id:clientId, client_secret:clientSecret, refresh_token:refreshToken, grant_type:'refresh_token' })
      .then(tokens => {
        this.accessToken = tokens.access_token;
        this.expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
        return this.accessToken;
      }).catch(error => {
        if (/invalid_grant|invalid_client|deleted_client/i.test(error.message)) {
          this.verifiedAt = 0;
          this.authError = 'Autorização Gmail expirada ou revogada. Reconecte a conta.';
        }
        throw error;
      }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async verifyConnection() {
    if (this.authError) throw Error(this.authError);
    if (this.verifiedAt && !this.verificationError && Date.now() - this.verifiedAt < 15 * 60000) return true;
    try {
      const profile = await this.request('/profile');
      if (profile.emailAddress?.toLowerCase() !== this.settings().email?.toLowerCase()) {
        this.authError = 'A conta Gmail autorizada mudou. Reconecte sua conta.';
        throw Error(this.authError);
      }
      this.verifiedAt = Date.now();
      this.verificationError = '';
      return true;
    } catch (error) {
      this.verifiedAt = 0;
      if (!this.authError) this.verificationError = `Falha temporária ao verificar Gmail: ${error.message}`;
      throw error;
    }
  }

  async request(path, { method = 'GET', body = null } = {}, retry = true) {
    const access = this.accessToken && Date.now() < this.expiresAt - 60000 ? this.accessToken : await this.token();
    const response = await this.fetcher(`${API_URL}${path}`, {
      method, headers: { Authorization:`Bearer ${access}`, ...(body ? { 'Content-Type':'application/json' } : {}) },
      ...(body ? { body:JSON.stringify(body) } : {}), signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    // Repetir POST /messages/send pode enviar a mesma mensagem duas vezes.
    // Apenas leituras GET são seguras para repetir após renovar o token.
    if (response.status === 401 && retry && method.toUpperCase() === 'GET') {
      await this.token(true);
      return this.request(path, { method, body }, false);
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch {}
      const error = new Error(`Gmail (${response.status}): ${detail.slice(0, 200) || 'falha na API'}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async getThread(id) {
    if (!/^[a-z0-9]{8,40}$/i.test(String(id))) throw Error('Conversa do Gmail inválida.');
    const thread = await this.request(`/threads/${id}?format=full`);
    const messages = (thread.messages || []).map(simplifyMessage);
    return { id:thread.id, messages, subject:messages[0]?.subject || '',
      updatedAt:messages.at(-1)?.date || 0, snippet:messages.at(-1)?.snippet || '' };
  }

  async inbox(limit = 15) {
    const result = await this.request(`/threads?maxResults=${limit}&q=${encodeURIComponent('in:inbox')}`);
    const replies = await Promise.allSettled((result.threads || []).map(thread => this.getThread(thread.id)));
    return replies.filter(item => item.status === 'fulfilled').map(item => item.value).sort((a,b) => b.updatedAt - a.updatedAt);
  }

  async send({ to, subject, body, attachment = null, threadId = '', inReplyTo = '', references = '' }) {
    const raw = makeMime({from:this.settings().email,to,subject,body,attachment,inReplyTo,references});
    return this.request('/messages/send', { method:'POST', body:{ raw, ...(threadId ? {threadId} : {}) } });
  }

  async findSentByMessageId(messageId) {
    if (!/^<wnd\.(?:alert\.)?[a-f0-9]{20}\.[a-f0-9]{16}@wnd\.net\.br>$/.test(messageId)) return null;
    const query = encodeURIComponent(`in:sent rfc822msgid:${messageId}`);
    const result = await this.request(`/messages?q=${query}&maxResults=5`);
    // Múltiplas correspondências são ambíguas e exigem inspeção manual.
    if (result.messages?.length !== 1) return null;
    const message = await this.request(`/messages/${result.messages[0].id}?format=metadata&metadataHeaders=Message-ID`);
    if (!message.labelIds?.includes('SENT') || header(message, 'Message-ID').toLowerCase() !== messageId.toLowerCase()) return null;
    return message.id && message.threadId ? { id:message.id, threadId:message.threadId } : null;
  }

  async reply(threadId, body) {
    const thread = await this.getThread(threadId);
    const previous = [...thread.messages].reverse().find(message => {
      try { return addressFrom(message.from).toLowerCase() !== this.settings().email?.toLowerCase(); } catch { return false; }
    });
    if (!previous || !previous.messageId) throw Error('Não foi possível identificar o destinatário desta conversa.');
    const to = addressFrom(previous.replyTo || previous.from);
    const references = `${previous.references} ${previous.messageId}`.trim();
    return this.send({ to, subject:/^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
      body, threadId, inReplyTo:previous.messageId, references });
  }
}

export async function submitApprovedEmail(id, gmail) {
  const item = get(id);
  if (!item || item.status !== 'approved' || item.channel !== 'email') throw Error('Candidatura por e-mail aprovada não encontrada.');
  if (!gmail.status().authorized) return { item, message:'Conecte o Gmail para enviar a candidatura aprovada.' };
  let raw;
  const messageId = `<wnd.${id}.${randomBytes(8).toString('hex')}@wnd.net.br>`;
  try {
    const attachment = readAttachment(item.resume_path);
    raw = makeMime({ from:gmail.status().email, to:item.recipient, subject:item.subject, body:item.cover_letter, attachment, messageId });
  } catch (error) {
    return { item:transition(id, 'failed', error.message), message:error.message };
  }
  claimSubmission(id, messageId);
  try {
    const result = await gmail.request('/messages/send', { method:'POST', body:{raw} });
    if (!result.id || !result.threadId) throw Error('Gmail não retornou confirmação de envio.');
    linkMail(id, result.threadId, result.id);
    return { item:transition(id, 'submitted', `Gmail mensagem ${result.id}, conversa ${result.threadId}`), message:'Candidatura enviada pelo Gmail.' };
  } catch (error) {
    // Após uma tentativa de envio, erros de rede e respostas ambíguas exigem conciliação manual.
    if ([400, 401, 403, 404, 422].includes(error.status)) transition(id, 'failed', error.message);
    return { item:get(id), message:error.status && [400,401,403,404,422].includes(error.status)
      ? `Gmail recusou o envio: ${error.message}`
      : 'Resultado do Gmail incerto. Confira a pasta Enviados antes de tentar novamente.' };
  }
}

export async function reconcileSentEmails(gmail, onError = () => {}) {
  const confirmed = [];
  for (const item of uncertainMailSubmissions()) {
    try {
      const message = await gmail.findSentByMessageId(item.outgoing_message_id);
      if (!message) continue;
      linkMail(item.id, message.threadId, message.id);
      transition(item.id, 'submitted', `Gmail mensagem ${message.id}, conversa ${message.threadId}`);
      confirmed.push(item.id);
    } catch (error) {
      onError(item, error);
    }
  }
  return confirmed;
}

// Avisos ao proprietário são independentes dos envios de candidaturas.
// Reservar o Message-ID antes da chamada ao Gmail evita reenvios após queda ou timeout.
export async function sendOpportunityAlert(item, gmail) {
  const id = item.id;
  const messageId = `<wnd.alert.${id}.${randomBytes(8).toString('hex')}@wnd.net.br>`;
  const subject = `Nova oportunidade · ${item.company} — ${item.title}`;
  const details = [
    `${item.company} — ${item.title}`,
    item.location ? `Local: ${item.location}` : '',
    item.contract_type ? `Tipo: ${item.contract_type}` : '',
    item.compensation ? `Remuneração: ${item.compensation}` : '',
    item.match_score == null ? '' : `Compatibilidade estimada: ${item.match_score}/100`,
    item.match_reason ? `Por que combina: ${item.match_reason}` : '',
    `Anúncio: ${item.source_url}`,
    `Candidatura: ${item.application_url}`,
    '',
    'Revise a vaga na aba Vagas do Kito. A candidatura exige sua aprovação.'
  ].filter(line => line !== null && line !== undefined).join('\n');
  const email = gmail.status().email;
  const raw = makeMime({from:email,to:email,subject,body:details,messageId});
  if (!claimJobAlert(id,messageId)) return {id,state:'already_claimed'};
  try {
    const result = await gmail.request('/messages/send', {method:'POST',body:{raw}});
    if (!result.id) throw Error('Gmail não confirmou o aviso.');
    markJobAlertSent(id,result.id);
    return {id,state:'sent'};
  } catch(error) {
    if ([400,401,403,404,422].includes(error.status)) failJobAlert(id,error.message);
    throw error;
  }
}

export async function reconcileJobAlerts(gmail, onError = () => {}) {
  const confirmed = [];
  for (const alert of unresolvedJobAlerts()) {
    try {
      const sent = await gmail.findSentByMessageId(alert.message_id);
      if (sent && markJobAlertSent(alert.opportunity_id,sent.id)) confirmed.push(alert.opportunity_id);
    } catch(error) { onError(alert,error); }
  }
  return confirmed;
}
