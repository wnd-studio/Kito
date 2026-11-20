import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = dirname(fileURLToPath(import.meta.url));
export const dbPath = process.env.VAGAS_DB_PATH || join(root, 'data', 'vagas.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL, title TEXT NOT NULL, source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL UNIQUE, application_url TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '', contract_type TEXT NOT NULL DEFAULT '', compensation TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '', match_reason TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '', verified_at TEXT, verification_notes TEXT NOT NULL DEFAULT '',
  deadline TEXT, channel TEXT NOT NULL DEFAULT 'manual', recipient TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '', cover_letter TEXT NOT NULL DEFAULT '',
  resume_path TEXT NOT NULL DEFAULT '', resume_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_review', notified_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  decided_at TEXT, submitted_at TEXT, submission_ref TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id TEXT,
  created_at TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL,
  ended_at TEXT, found INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running', notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS mail_links (
  opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
  thread_id TEXT NOT NULL UNIQUE,
  sent_message_id TEXT NOT NULL,
  last_notified_message_id TEXT NOT NULL,
  linked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_alerts (
  opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
  message_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('sending','sent','failed')),
  gmail_message_id TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dismissed_opportunities (
  source_url TEXT PRIMARY KEY,
  signature TEXT NOT NULL DEFAULT '',
  dismissed_at TEXT NOT NULL
);`);
if (!db.prepare('PRAGMA table_info(opportunities)').all().some(column => column.name === 'match_score')) {
  db.exec('ALTER TABLE opportunities ADD COLUMN match_score INTEGER');
}
if (!db.prepare('PRAGMA table_info(mail_links)').all().some(column => column.name === 'last_read_message_id')) {
  db.exec("ALTER TABLE mail_links ADD COLUMN last_read_message_id TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(opportunities)').all().some(column => column.name === 'outgoing_message_id')) {
  db.exec("ALTER TABLE opportunities ADD COLUMN outgoing_message_id TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(opportunities)').all().some(column => column.name === 'desktop_notified_at')) {
  db.exec('ALTER TABLE opportunities ADD COLUMN desktop_notified_at TEXT');
}

const now = () => new Date().toISOString();
const val = (v, limit = 10000) => String(v ?? '').trim().slice(0, limit);
const validStatus = new Set(['pending_review','approved','submitting','rejected','submitted','needs_action','failed']);
const validChannels = new Set(['email','form','manual']);
const changes = new Set(['cover_letter','subject','recipient','resume_path','resume_notes','match_reason']);
const normalized = value => val(value, 200).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
const opportunitySignature = (company, title, location) =>
  [company, title, location].map(normalized).join('|');

export function canonicalUrl(raw) {
  const url = new URL(String(raw));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw Error('Link deve ser HTTP ou HTTPS.');
  if (url.username || url.password || !url.hostname || ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname.toLowerCase())) throw Error('Link público inválido.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, '');
}
const event = (id, type, detail='') => db.prepare('INSERT INTO events (opportunity_id,created_at,type,detail) VALUES (?,?,?,?)').run(id, now(), type, val(detail,2000));
export function list({status='',search=''}={}) {
  let sql = 'SELECT * FROM opportunities WHERE 1=1';
  const args = [];
  if (status && validStatus.has(status)) { sql += ' AND status=?'; args.push(status); }
  if (search) {sql += ' AND (company LIKE ? OR title LIKE ? OR source LIKE ?)'; args.push(...Array(3).fill('%'+val(search,100)+'%'));}
  sql += ` ORDER BY CASE status WHEN 'pending_review' THEN 0 WHEN 'approved' THEN 1 WHEN 'submitting' THEN 2 WHEN 'needs_action' THEN 3 WHEN 'failed' THEN 4 ELSE 5 END, COALESCE(match_score,-1) DESC, created_at DESC LIMIT 300`;
  return db.prepare(sql).all(...args);
}
export function get(id) {return db.prepare('SELECT * FROM opportunities WHERE id=?').get(id) || null;}
export function stats() {return db.prepare('SELECT status, COUNT(*) AS count FROM opportunities GROUP BY status').all();}
export function recentEvents(limit=60) {return db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(Math.min(100,Math.max(1,Number(limit)||60)));}
export function recentRuns() {return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 20').all();}

export function ingest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Oportunidade inválida.');
  const company = val(data.company, 200), title=val(data.title, 200);
  if (!company || !title) throw Error('Empresa e cargo são obrigatórios.');
  const source_url=canonicalUrl(data.source_url);
  const application_url=canonicalUrl(data.application_url || source_url);
  const id=createHash('sha256').update(source_url).digest('hex').slice(0,20);
  if (get(id)) return {id,created:false};
  const location = val(data.location, 150);
  const signature = opportunitySignature(company, title, location);
  const dismissed = db.prepare(`SELECT source_url FROM dismissed_opportunities
    WHERE source_url=? OR (signature=? AND dismissed_at>=?) LIMIT 1`).get(
      source_url, signature, new Date(Date.now() - 90 * 86400000).toISOString());
  if (dismissed) return {id,created:false,dismissed:true};
  // A mesma vaga pode aparecer no LinkedIn, em redes sociais e no site oficial.
  // Compara campos completos para não confundir posições distintas de uma empresa.
  if (normalized(company) !== 'confidencial' && normalized(company) !== 'empresa confidencial' && location) {
    const matches = db.prepare('SELECT id,company,title,location FROM opportunities WHERE created_at >= ?')
      .all(new Date(Date.now() - 90 * 86400000).toISOString());
    const duplicate = matches.find(row => normalized(row.company) === normalized(company)
      && normalized(row.title) === normalized(title)
      && normalized(row.location) === normalized(location));
    if (duplicate) return {id:duplicate.id,created:false,duplicate_type:'cross_source'};
  }
  const matchScore = data.match_score == null ? null : Number(data.match_score);
  if (matchScore !== null && (!Number.isInteger(matchScore) || matchScore < 0 || matchScore > 100)) {
    throw Error('Pontuação de aderência deve ser um inteiro entre 0 e 100.');
  }
  const channel=validChannels.has(data.channel)?data.channel:'manual';
  const verified_at=data.verification?.status==='verified' && val(data.verification?.notes) && !isNaN(Date.parse(data.verification?.checked_at)) ? new Date(data.verification.checked_at).toISOString():null;
  if (data.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) throw Error('Prazo deve ser AAAA-MM-DD.');
  const at=now();
  db.prepare(`INSERT INTO opportunities
    (id,company,title,source,source_url,application_url,location,contract_type,compensation,requirements,match_reason,description,verified_at,verification_notes,deadline,channel,recipient,subject,cover_letter,resume_path,resume_notes,created_at,updated_at,match_score)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,company,title,val(data.source,150),source_url,application_url,location,val(data.contract_type,100),val(data.compensation,200),
      val(data.requirements),val(data.match_reason),val(data.description),verified_at,val(data.verification?.notes,2000),data.deadline||null,channel,
      val(data.recipient,320),val(data.subject,300),val(data.cover_letter,16000),val(data.resume_path,1000),val(data.resume_notes,2000),at,at,matchScore);
  event(id, 'imported', `Origem: ${val(data.source,150) || 'não informada'}`);
  return {id,created:true};
}

export function edit(id, fields) {
  const item=get(id);
  if (!item) throw Error('Oportunidade inexistente.');
  if (item.status!=='pending_review') throw Error('Candidatura decidida. Conteúdo bloqueado.');
  const entries=Object.entries(fields||{}).filter(([k])=>changes.has(k));
  if (!entries.length) throw Error('Nenhuma alteração válida.');
  for (const [key,value] of entries) {
    if (key==='recipient' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw Error('E-mail do destinatário inválido.');
    db.prepare(`UPDATE opportunities SET ${key}=?,updated_at=? WHERE id=?`).run(val(value, key==='cover_letter'?16000:2000), now(),id);
  }
  event(id,'edited',entries.map(([k])=>k).join(', '));
  return get(id);
}

export function decide(id, decision) {
  if (!['approved','rejected'].includes(decision)) throw Error('Decisão inválida.');
  const item=get(id);
  if (!item) throw Error('Oportunidade inexistente.');
  const rejectableStatuses=['pending_review','approved','needs_action','failed'];
  const allowedStatuses=decision==='rejected'?rejectableStatuses:['pending_review'];
  if (!allowedStatuses.includes(item.status)) {
    if (decision==='rejected' && ['submitting','submitted'].includes(item.status)) {
      throw Error('Não é possível rejeitar uma candidatura em processamento ou já enviada.');
    }
    throw Error('Esta oportunidade já recebeu uma decisão.');
  }
  if (decision==='approved') {
    if (!item.verified_at) throw Error('Verifique a vaga e registre evidência antes de aprovar.');
    if (!item.cover_letter.trim()) throw Error('Escreva a apresentação antes de aprovar.');
    if (item.deadline && item.deadline < new Date().toISOString().slice(0,10)) throw Error('Prazo expirado.');
    if (item.channel==='email' && (!item.recipient || !item.subject)) throw Error('Informe destinatário e assunto para envio por e-mail.');
  }
  const updated=db.prepare('UPDATE opportunities SET status=?,decided_at=?,updated_at=? WHERE id=? AND status=?')
    .run(decision,now(),now(),id,item.status);
  if (!updated.changes) throw Error('O estado da oportunidade mudou. Atualize a lista e tente novamente.');
  const detail=decision==='approved'
    ? `Canal: ${item.channel}; Destinatário: ${item.recipient || 'nenhum'}`
    : item.status==='pending_review'?'Rejeitada pelo usuário':`Rejeitada pelo usuário antes do envio (estado anterior: ${item.status}).`;
  event(id, decision, detail);
  return get(id);
}

export function deleteOpportunity(id) {
  const item = get(id);
  if (!item) throw Error('Oportunidade inexistente.');
  if (['submitting', 'submitted'].includes(item.status)) {
    throw Error('Não é possível excluir uma candidatura em processamento ou já enviada.');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = get(id);
    if (!current || ['submitting', 'submitted'].includes(current.status)) {
      throw Error('O estado da candidatura mudou. Atualize a lista.');
    }
    const alert = db.prepare('SELECT state FROM job_alerts WHERE opportunity_id=?').get(id);
    if (alert?.state === 'sending') {
      throw Error('Há um aviso de e-mail pendente de confirmação. Aguarde a conciliação.');
    }
    db.prepare('INSERT OR REPLACE INTO dismissed_opportunities (source_url,signature,dismissed_at) VALUES (?,?,?)')
      .run(current.source_url, opportunitySignature(current.company,current.title,current.location),now());
    db.prepare('DELETE FROM mail_links WHERE opportunity_id=?').run(id);
    db.prepare('DELETE FROM job_alerts WHERE opportunity_id=?').run(id);
    db.prepare('DELETE FROM events WHERE opportunity_id=?').run(id);
    const result = db.prepare('DELETE FROM opportunities WHERE id=?').run(id);
    if (result.changes !== 1) throw Error('A vaga foi alterada. Atualize a lista.');
    db.exec('COMMIT');
    return {deleted:true,id};
  } catch(error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Reserva uma candidatura aprovada para um único processamento externo.
// Se o agente cair depois do envio, o estado permanece em processamento:
// exige conciliação antes de uma nova tentativa e evita reenvio acidental.
export function claimSubmission(id, outgoingMessageId = '') {
  const item=get(id);
  if (!item) throw Error('Oportunidade inexistente.');
  if (item.status!=='approved') throw Error('Candidatura já está em processamento ou ainda não foi aprovada.');
  if (!item.verified_at) throw Error('Vaga sem verificação registrada.');
  if (item.deadline && item.deadline < new Date().toISOString().slice(0,10)) throw Error('Prazo da vaga expirado. Revise antes de qualquer envio.');
  if (outgoingMessageId && !/^<wnd\.[a-f0-9]{20}\.[a-f0-9]{16}@wnd\.net\.br>$/.test(outgoingMessageId)) {
    throw Error('Identificador da mensagem de candidatura inválido.');
  }
  const updated=db.prepare("UPDATE opportunities SET status='submitting',outgoing_message_id=?,updated_at=? WHERE id=? AND status='approved'")
    .run(outgoingMessageId,now(),id);
  if (!updated.changes) throw Error('Candidatura reservada por outro processo.');
  event(id,'submission_claimed',`Canal: ${item.channel}; envio ainda não confirmado.`);
  return get(id);
}

export function transition(id, status, evidence) {
  if (!['submitted','needs_action','failed'].includes(status)) throw Error('Transição inválida.');
  const item=get(id);
  if (!item) throw Error('Oportunidade inexistente.');
  if (!['approved','submitting','needs_action','failed'].includes(item.status)) throw Error('Envio só pode ocorrer após aprovação individual.');
  if (status==='submitted' && item.status!=='submitting') throw Error('Reserve a candidatura com claim antes de registrar envio confirmado.');
  if (status==='submitted' && (!val(evidence) || val(evidence).length<8)) throw Error('Informe confirmação verificável do envio (link ou referência).');
  if (status!=='submitted' && !val(evidence)) throw Error('Informe o motivo ou passo pendente.');
  db.prepare('UPDATE opportunities SET status=?,submitted_at=?,submission_ref=?,last_error=?,updated_at=? WHERE id=?').run(
    status,status==='submitted'?now():item.submitted_at,status==='submitted'?val(evidence,2000):item.submission_ref,
    status==='submitted'?null:val(evidence,2000),now(),id);
  event(id,status,val(evidence,2000));return get(id);
}
export function markNotified(id) {
  if (!get(id)) throw Error('Oportunidade inexistente.');
  db.prepare('UPDATE opportunities SET notified_at=?,updated_at=? WHERE id=?').run(now(),now(),id);
  event(id,'notified','Notificação enviada ao endereço do usuário.');return get(id);
}
export function queue() {return db.prepare("SELECT * FROM opportunities WHERE status='approved' ORDER BY decided_at ASC").all();}
export function uncertainMailSubmissions() {
  return db.prepare("SELECT * FROM opportunities WHERE status='submitting' AND outgoing_message_id<>'' ORDER BY updated_at ASC LIMIT 30").all();
}
export function notifications() {
  return db.prepare(`SELECT o.* FROM opportunities o LEFT JOIN job_alerts a ON a.opportunity_id=o.id
    WHERE o.notified_at IS NULL AND o.verified_at IS NOT NULL AND o.status='pending_review'
      AND a.opportunity_id IS NULL ORDER BY o.created_at ASC LIMIT 30`).all();
}
export function claimJobAlert(id, messageId) {
  if (!/^<wnd\.alert\.[a-f0-9]{20}\.[a-f0-9]{16}@wnd\.net\.br>$/.test(messageId)) {
    throw Error('Identificador do aviso inválido.');
  }
  const timestamp = now();
  const result = db.prepare(`INSERT OR IGNORE INTO job_alerts
    (opportunity_id,message_id,state,created_at,updated_at)
    SELECT id,?,'sending',?,? FROM opportunities
    WHERE id=? AND notified_at IS NULL AND verified_at IS NOT NULL AND status='pending_review'`)
    .run(messageId,timestamp,timestamp,id);
  if (result.changes) event(id,'alert_claimed','Aviso de vaga reservado para envio ao próprio usuário.');
  return Boolean(result.changes);
}
export function unresolvedJobAlerts() {
  return db.prepare(`SELECT a.*,o.company,o.title FROM job_alerts a
    JOIN opportunities o ON o.id=a.opportunity_id WHERE a.state='sending'
    ORDER BY a.created_at ASC LIMIT 30`).all();
}
export function markJobAlertSent(id, gmailMessageId) {
  if (!gmailMessageId || !/^[a-zA-Z0-9_-]{5,120}$/.test(gmailMessageId)) throw Error('Confirmação Gmail inválida.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const timestamp = now();
    const result = db.prepare(`UPDATE job_alerts SET state='sent',gmail_message_id=?,last_error='',updated_at=?
      WHERE opportunity_id=? AND state='sending'`).run(gmailMessageId,timestamp,id);
    if (result.changes) {
      db.prepare('UPDATE opportunities SET notified_at=?,updated_at=? WHERE id=? AND notified_at IS NULL')
        .run(timestamp,timestamp,id);
      event(id,'notified',`Aviso Gmail confirmado (${gmailMessageId}).`);
    }
    db.exec('COMMIT');
    return Boolean(result.changes);
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}
export function failJobAlert(id, reason) {
  const result = db.prepare(`UPDATE job_alerts SET state='failed',last_error=?,updated_at=?
    WHERE opportunity_id=? AND state='sending'`).run(val(reason,1000),now(),id);
  if (result.changes) event(id,'alert_failed',val(reason,1000));
  return Boolean(result.changes);
}
export function jobAlertStats() {
  return {
    pending: db.prepare(`SELECT COUNT(*) AS count FROM opportunities o LEFT JOIN job_alerts a ON a.opportunity_id=o.id
      WHERE o.notified_at IS NULL AND o.verified_at IS NOT NULL AND o.status='pending_review' AND a.opportunity_id IS NULL`).get().count,
    uncertain:db.prepare("SELECT COUNT(*) AS count FROM job_alerts WHERE state='sending'").get().count,
    failed:db.prepare("SELECT COUNT(*) AS count FROM job_alerts WHERE state='failed'").get().count
  };
}
export function desktopNotifications(limit = 5) {
  return db.prepare(`SELECT id,company,title,source_url FROM opportunities
    WHERE desktop_notified_at IS NULL AND verified_at IS NOT NULL
    ORDER BY created_at ASC LIMIT ?`).all(Math.min(10, Math.max(1, Number(limit) || 5)));
}
export function markDesktopNotified(id) {
  const result = db.prepare('UPDATE opportunities SET desktop_notified_at=? WHERE id=? AND desktop_notified_at IS NULL')
    .run(now(), id);
  if (result.changes) event(id, 'desktop_notified', 'Aviso exibido pelo aplicativo Windows.');
  return Boolean(result.changes);
}
export function linkMail(id, threadId, sentMessageId) {
  if (!get(id)) throw Error('Oportunidade inexistente.');
  if (!threadId || !sentMessageId) throw Error('Referência de conversa inválida.');
  db.prepare(`INSERT INTO mail_links (opportunity_id,thread_id,sent_message_id,last_notified_message_id,last_read_message_id,linked_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(opportunity_id) DO UPDATE SET
    thread_id=excluded.thread_id,sent_message_id=excluded.sent_message_id,
    last_notified_message_id=excluded.last_notified_message_id,
    last_read_message_id=excluded.last_read_message_id,linked_at=excluded.linked_at`)
    .run(id,threadId,sentMessageId,sentMessageId,sentMessageId,now());
  event(id,'mail_linked',`Conversa Gmail ${threadId}`);
}
export function mailLinks() {
  return db.prepare(`SELECT ml.*,o.company,o.title FROM mail_links ml
    JOIN opportunities o ON o.id=ml.opportunity_id ORDER BY ml.linked_at DESC`).all();
}
export function markMailReplyNotified(id, messageId) {
  const result=db.prepare('UPDATE mail_links SET last_notified_message_id=? WHERE opportunity_id=? AND last_notified_message_id<>?').run(messageId,id,messageId);
  if (result.changes) event(id, 'mail_reply', `Nova resposta no Gmail (${messageId}).`);
  return Boolean(result.changes);
}
export function acknowledgeMailReply(id) {
  const result=db.prepare('UPDATE mail_links SET last_read_message_id=last_notified_message_id WHERE thread_id=?').run(id);
  if (!result.changes) throw Error('Conversa não vinculada a candidatura.');
}
export function startRun(notes='') {return Number(db.prepare('INSERT INTO runs (started_at,notes) VALUES (?,?)').run(now(),val(notes,2000)).lastInsertRowid);}
export function finishRun(id,status,found=0,added=0,notes='') {
  if (!['completed','failed'].includes(status)) throw Error('Status de execução inválido.');
  const result=db.prepare('UPDATE runs SET ended_at=?,status=?,found=?,added=?,notes=? WHERE id=? AND ended_at IS NULL').run(now(),status,Number(found)||0,Number(added)||0,val(notes,2000),id);
  if (!result.changes) throw Error('Execução não encontrada ou já concluída.');
}
export function packet(id) {
  const item=get(id); if(!item) throw Error('Oportunidade inexistente.');
  const folder=join(process.env.VAGAS_OUTBOX_PATH || join(root,'outbox'),id);mkdirSync(folder,{recursive:true});
  const fields={...item,created_at:item.created_at};
  writeFileSync(join(folder,'candidatura.json'),JSON.stringify(fields,null,2),'utf8');
  writeFileSync(join(folder,'apresentacao.txt'),`${item.subject}\n\n${item.cover_letter}\n`,'utf8');
  if(item.resume_path) {
    const file=resolve(item.resume_path);
    if (!existsSync(file)) throw Error('Currículo referenciado não encontrado no computador.');
    copyFileSync(file,join(folder,basename(file)));
  }
  event(id,'packet_created',folder);
  return folder;
}
export function close() {db.close();}
