import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { list, stats, recentEvents, recentRuns, ingest, edit, decide, deleteOpportunity, packet, queue, get, mailLinks, markMailReplyNotified, acknowledgeMailReply, transition, notifications, jobAlertStats } from './core.mjs';
import { submitApprovedEmail, reconcileSentEmails, sendOpportunityAlert, reconcileJobAlerts } from './gmail.mjs';
import { getHub, getPc, addTask, toggleTask, deleteTask, addRoutine, routineDay, deleteRoutine, addTransaction, deleteTransaction, addShortcut, deleteShortcut, setModules, setOverviewLayout, setJobPreferences, addSpace, editSpace, deleteSpace, addSpaceItem, toggleSpaceItem, deleteSpaceItem, addBankItem, removeBankItem, addFinanceBill, setFinanceBillPaid, deleteFinanceBill, setBankCategory } from './hub.mjs';
import { bankSnapshot, syncBanking, refreshBankItem } from './banking.mjs';
import { PluggyError } from './pluggy.mjs';
import { searchJobs } from './job-search.mjs';

let PORT = Number(process.env.VAGAS_PORT ?? 4517);
const HOST = '127.0.0.1';
let BASE = `http://${HOST}:${PORT}`;
const csrf = randomBytes(24).toString('hex');
let gmail = null;
let notifyMail = () => {};
let mailSyncPromise = null;
let lastMailError = '';
const sending = new Map();

function submitOnce(id) {
  if (sending.has(id)) return sending.get(id);
  const pending = submitApprovedEmail(id, gmail).finally(() => sending.delete(id));
  sending.set(id, pending);
  return pending;
}

export function setGmailService(service, notifier = () => {}) {
  gmail = service;
  notifyMail = notifier;
  if (gmail?.status().authorized) syncMail().catch(error => { lastMailError = error.message; });
}

function requireGmail() {
  if (!gmail) throw Error('Abra o aplicativo Windows para conectar o Gmail.');
  return gmail;
}

function mailStatus() {
  const links = mailLinks();
  return { ...(gmail?.status() || {configured:false,connected:false,email:'',expectedEmail:''}),
    pending:queue().filter(item => item.channel === 'email').length,
    alerts:jobAlertStats(),
    unread:links.filter(link => link.last_notified_message_id !== link.sent_message_id &&
      link.last_read_message_id !== link.last_notified_message_id).length,
    linked:links.map(({opportunity_id,thread_id,company,title,linked_at,last_notified_message_id,last_read_message_id,sent_message_id}) => ({
      opportunityId:opportunity_id,threadId:thread_id,company,title,linkedAt:linked_at,
      unread:last_notified_message_id!==sent_message_id && last_notified_message_id!==last_read_message_id
    })), error:gmail?.status().error || lastMailError };
}

async function syncMail() {
  if (mailSyncPromise) return mailSyncPromise;
  if (!gmail?.status().authorized) return mailStatus();
  mailSyncPromise=(async()=>{
    try {
      await gmail.verifyConnection();
      lastMailError = '';
      // Consulta Enviados antes de lidar com novos envios. Uma resposta HTTP perdida
      // pode ter deixado o registro em 'submitting' embora o Gmail tenha enviado.
      await reconcileSentEmails(gmail, (item, error) => {
        lastMailError = `Não foi possível conciliar ${item.company}: ${error.message}`;
      });
      for (const item of queue().filter(item => item.channel==='email')) {
        try { await submitOnce(item.id); }
        catch(error) { lastMailError=error.message; }
      }
      await reconcileJobAlerts(gmail, (alert,error) => {
        lastMailError = `Não foi possível conferir aviso de ${alert.company}: ${error.message}`;
      });
      for (const item of notifications()) {
        try { await sendOpportunityAlert(item,gmail); }
        catch(error) { lastMailError = `Aviso de ${item.company}: ${error.message}`; }
      }
      for (const link of mailLinks()) {
        try {
          const thread=await gmail.getThread(link.thread_id);
          const sentIndex=thread.messages.findIndex(message => message.id===link.sent_message_id);
          if(sentIndex<0)continue;
          const replies=thread.messages.slice(sentIndex+1).filter(message => {
            const from=message.from.match(/<([^<>]+)>/)?.[1] || message.from;
            return from.trim().toLowerCase()!==gmail.status().email?.toLowerCase();
          });
          const latest=replies.at(-1);
          if(latest && markMailReplyNotified(link.opportunity_id,latest.id)) {
            notifyMail({ company:link.company,title:link.title,from:latest.from,threadId:link.thread_id });
          }
        } catch(error) { lastMailError=error.message; }
      }
      return mailStatus();
    } finally { mailSyncPromise=null; }
  })();
  return mailSyncPromise;
}
const mailTimer=setInterval(()=>syncMail().catch(error=>{lastMailError=error.message;}),120000);
mailTimer.unref?.();
const assets = new Map([
  ['/favicon.svg',['favicon.svg','image/svg+xml']],
  ['/kito-mark.png',['kito-mark.png','image/png']],
  ['/style.css',['style.css','text/css; charset=utf-8']],
  ['/liquid.css',['liquid.css','text/css; charset=utf-8']],
  ['/professional.css',['professional.css','text/css; charset=utf-8']],
  ['/kito.css',['kito.css','text/css; charset=utf-8']],
  ['/app.js',['app.js','text/javascript; charset=utf-8']]
]);
function json(res,code,body) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(body));
}
async function body(req) {
  let text='';
  for await (const chunk of req) {text+=chunk.toString();if(text.length>100000)throw Error('Corpo da requisição grande demais.');}
  return JSON.parse(text || '{}');
}
const server=http.createServer(async(req,res)=>{
  try {
    if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(req.headers.host)) return json(res,403,{error:'Acesso permitido apenas pelo endereço local.'});
    const url = new URL(req.url, BASE);
    if (req.method==='GET' && ['/', '/index.html'].includes(url.pathname)) {
      const html=readFileSync(join(import.meta.dirname,'public','index.html'),'utf8')
        .replace('%%CSRF%%',csrf)
        .replace('%%DESKTOP%%',process.env.VAGAS_DESKTOP==='1'?'desktop-app':'');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
      return res.end(html);
    }
    if (req.method==='GET' && url.pathname==='/favicon.ico') { res.writeHead(204,{'Cache-Control':'public, max-age=3600'});return res.end(); }
    if (req.method==='GET' && assets.has(url.pathname)) {
      const [name,type]=assets.get(url.pathname);
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      return res.end(readFileSync(join(import.meta.dirname,'public',name)));
    }
    if (req.method==='GET' && url.pathname==='/api/opportunities') return json(res,200,{items:list({status:url.searchParams.get('status')||'',search:url.searchParams.get('q')||''}),stats:stats()});
    if (req.method==='GET' && url.pathname==='/api/activity') return json(res,200,{events:recentEvents(),runs:recentRuns()});
    if (req.method==='GET' && url.pathname==='/api/hub') return json(res,200,getHub(url.searchParams.get('day')||new Date().toISOString().slice(0,10)));
    if (req.method==='GET' && url.pathname==='/api/pc') return json(res,200,getPc());
    if (req.method==='GET' && url.pathname==='/api/banking') return json(res,200,bankSnapshot(url.searchParams.get('month')||undefined));
    if (req.method==='GET' && url.pathname==='/api/mail/status') return json(res,200,mailStatus());
    if (req.method==='GET' && url.pathname==='/api/mail/inbox') return json(res,200,{threads:await requireGmail().inbox(20)});
    const mailThread=url.pathname.match(/^\/api\/mail\/threads\/([a-z0-9]{8,40})$/i);
    if (req.method==='GET' && mailThread) {
      const thread=await requireGmail().getThread(mailThread[1]);
      if(mailLinks().some(link=>link.thread_id===thread.id))acknowledgeMailReply(thread.id);
      return json(res,200,{thread});
    }
    if(req.method==='POST') {
      if(req.headers.origin!==BASE || req.headers['x-csrf-token']!==csrf || !String(req.headers['content-type']||'').startsWith('application/json')) return json(res,403,{error:'Origem ou token inválido.'});
      const data=await body(req);
      if(url.pathname==='/api/opportunities')return json(res,200,ingest({...data,channel:'manual',source:'Adicionada manualmente'}));
      if(url.pathname==='/api/opportunities/search')return json(res,200,await searchJobs());
      if(url.pathname==='/api/mail/configure')return json(res,200,{status:requireGmail().configure(data.clientId,data.clientSecret)});
      if(url.pathname==='/api/mail/disconnect')return json(res,200,{status:requireGmail().disconnect()});
      if(url.pathname==='/api/mail/connect/cancel')return json(res,200,{status:requireGmail().cancelConnect()});
      if(url.pathname==='/api/mail/connect'){
        const status=await requireGmail().connect();
        // O envio de candidaturas já aprovadas continua enquanto o usuário usa o app.
        syncMail().catch(error=>{lastMailError=error.message;});
        return json(res,200,{status});
      }
      if(url.pathname==='/api/mail/sync')return json(res,200,{status:await syncMail()});
      const mailReply=url.pathname.match(/^\/api\/mail\/threads\/([a-z0-9]{8,40})\/reply$/i);
      if(mailReply){
        const message=String(data.message||'').trim();
        if(!message || message.length>16000)throw Error('Escreva uma resposta de até 16.000 caracteres.');
        const sent=await requireGmail().reply(mailReply[1],message);
        if(!sent.id || !sent.threadId)throw Error('O Gmail não confirmou a resposta. Consulte Enviados antes de repetir.');
        return json(res,200,{sent:true,threadId:sent.threadId});
      }
      if(url.pathname==='/api/tasks')return json(res,200,{ok:true,...addTask(data)});
      if(url.pathname==='/api/routines')return json(res,200,{ok:true,...addRoutine(data)});
      if(url.pathname==='/api/transactions')return json(res,200,{ok:true,...addTransaction(data)});
      if(url.pathname==='/api/finance/bills')return json(res,200,{ok:true,...addFinanceBill(data)});
      const financeBillAction=url.pathname.match(/^\/api\/finance\/bills\/(\d+)\/(paid|delete)$/);
      if(financeBillAction){
        const [,id,action]=financeBillAction;
        return json(res,200,{ok:true,...(action==='paid'?setFinanceBillPaid(id,data.month,data.paid):deleteFinanceBill(id))});
      }
      const bankCategoryAction=url.pathname.match(/^\/api\/banking\/transactions\/([^/]+)\/category$/);
      if(bankCategoryAction)return json(res,200,{ok:true,...setBankCategory(decodeURIComponent(bankCategoryAction[1]),data.category)});
      if(url.pathname==='/api/banking/items')return json(res,200,{ok:true,...addBankItem(data.itemId)});
      if(url.pathname==='/api/banking/sync')return json(res,200,{ok:true,...await syncBanking()});
      const bankRefresh=url.pathname.match(/^\/api\/banking\/items\/([a-f0-9-]+)\/refresh$/);
      if(bankRefresh)return json(res,200,{ok:true,...await refreshBankItem(bankRefresh[1])});
      const bankRemoval=url.pathname.match(/^\/api\/banking\/items\/([a-f0-9-]+)\/remove$/);
      if(bankRemoval)return json(res,200,{ok:true,...removeBankItem(bankRemoval[1])});
      if(url.pathname==='/api/shortcuts')return json(res,200,{ok:true,...addShortcut(data)});
      if(url.pathname==='/api/spaces')return json(res,200,{ok:true,...addSpace(data)});
      if(url.pathname==='/api/preferences/modules')return json(res,200,{ok:true,modules:setModules(data)});
      if(url.pathname==='/api/preferences/jobs')return json(res,200,{ok:true,job_preferences:setJobPreferences(data)});
      if(url.pathname==='/api/preferences/overview-layout')return json(res,200,{ok:true,overview_layout:setOverviewLayout(data)});
      const spaceItems=url.pathname.match(/^\/api\/spaces\/(\d+)\/items\/(\d+)\/(toggle|delete)$/);
      if(spaceItems){
        const [,spaceId,itemId,action]=spaceItems;
        return json(res,200,{ok:true,...(action==='toggle'?toggleSpaceItem(spaceId,itemId,!!data.done):deleteSpaceItem(spaceId,itemId))});
      }
      const spaceAction=url.pathname.match(/^\/api\/spaces\/(\d+)\/(items|edit|delete)$/);
      if(spaceAction){
        const [,spaceId,action]=spaceAction;
        return json(res,200,{ok:true,...(action==='items'?addSpaceItem(spaceId,data):action==='edit'?editSpace(spaceId,data):deleteSpace(spaceId))});
      }
      const moduleAction=url.pathname.match(/^\/api\/(tasks|routines|transactions|shortcuts)\/(\d+)\/(toggle|delete)$/);
      if(moduleAction) {
        const [,module,id,action]=moduleAction;
        if(action==='delete') return json(res,200,{ok:true,...({tasks:deleteTask,routines:deleteRoutine,transactions:deleteTransaction,shortcuts:deleteShortcut})[module](id)});
        if(module==='tasks') return json(res,200,{ok:true,...toggleTask(id,!!data.done)});
        if(module==='routines') return json(res,200,{ok:true,...routineDay(id,data.day,!!data.done)});
      }
      const opportunityAction=url.pathname.match(/^\/api\/opportunities\/([a-f0-9]{20})\/(edit|approve|reject|packet|delete)$/);
      if(opportunityAction){
        const [,id,action]=opportunityAction;
        const result=action==='edit'?edit(id,data):action==='packet'?{folder:packet(id)}
          :action==='delete'?deleteOpportunity(id):decide(id,action==='approve'?'approved':'rejected');
        if(action==='approve') {
          if(result.channel==='email') {
            if(gmail?.status().authorized){
              try {
                await gmail.verifyConnection();
                const sent=await submitOnce(id);
                return json(res,200,{ok:true,item:sent.item,message:sent.message});
              } catch(error) {
                // A decisão já foi gravada. Falhas na conexão preservam a fila,
                // e uma tentativa incerta fica em processamento para conciliação.
                lastMailError=error.message;
                const current=get(id);
                return json(res,200,{ok:true,item:current,message:current.status==='approved'
                  ? 'Aprovada e aguardando o Gmail. O aplicativo tentará enviar quando a conexão voltar.'
                  : 'Aprovada. Verifique o estado do envio no Correio antes de qualquer nova tentativa.'});
              }
            }
            return json(res,200,{ok:true,item:result,message:'Aprovada. Conecte o Gmail em Correio para enviar automaticamente.'});
          }
          return json(res,200,{ok:true,item:transition(id,'needs_action','Inscrição externa autorizada. Abra o link da vaga e finalize o formulário.'),
            message:'Aprovada. Abra a página de inscrição para concluir.'});
        }
        return json(res,200,{ok:true,item:result});
      }
    }
    return json(res,404,{error:'Rota não encontrada.'});
  } catch(error) {return json(res,error instanceof PluggyError?error.status:400,{error:error.message});}
});
export const serverReady = new Promise((resolve, reject) => {
  server.once('error',reject);
  server.listen(PORT,HOST,()=>{
    PORT = server.address().port;
    BASE = `http://${HOST}:${PORT}`;
    console.log(`Kito: ${BASE}`);
    resolve(BASE);
  });
});
export { server };
