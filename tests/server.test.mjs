import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const folder=mkdtempSync(join(tmpdir(),'wnd-central-http-'));
const port=await new Promise((resolvePort,reject)=>{
  const sock=createServer();sock.once('error',reject);
  sock.listen(0,'127.0.0.1',()=>{const chosen=sock.address().port;sock.close(()=>resolvePort(chosen));});
});
const root=resolve(import.meta.dirname,'..');
const app=spawn(process.execPath,['server.mjs'],{
  cwd:root,windowsHide:true,env:{...process.env,VAGAS_DB_PATH:join(folder,'test.sqlite'),VAGAS_PORT:String(port)}
});
const base=`http://127.0.0.1:${port}`;
let logs='';
app.stdout.on('data',d=>logs+=d.toString());
app.stderr.on('data',d=>logs+=d.toString());
async function ready(){
  for(let i=0;i<100;i++){
    if(app.exitCode!==null)throw Error('Servidor encerrou: '+logs);
    try{const res=await fetch(base);if(res.ok)return;}catch{}
    await delay(60);
  }
  throw Error('Servidor não iniciou: '+logs);
}
await ready();
const res=await fetch(base);
const html=await res.text();
const csrf=html.match(/name="csrf-token" content="([^"]+)"/)?.[1];
assert.ok(csrf);
const post=(path,data={},headers={})=>fetch(base+path,{method:'POST',headers:{
  'Content-Type':'application/json',Origin:base,'x-csrf-token':csrf,...headers
},body:JSON.stringify(data)});

after(async()=>{
  if(app.exitCode===null){
    app.kill();
    await Promise.race([new Promise(r=>app.once('exit',r)),delay(4000)]);
  }
  rmSync(folder,{recursive:true,force:true});
});

test('servidor serve a central e nega requisições sem CSRF válido',async()=>{
  assert.match(html,/<title>Kito · Hoje<\/title>/);
  assert.equal((await fetch(base+'/app.js')).status,200);
  const css = await fetch(base+'/kito.css');
  assert.equal(css.status,200);
  assert.match(css.headers.get('content-type'),/text\/css/);
  assert.match(await css.text(),/--accent: #d6ff44/);
  const mark = await fetch(base+'/kito-mark.png');
  assert.equal(mark.status,200);
  assert.equal(mark.headers.get('content-type'),'image/png');
  assert.equal((await mark.arrayBuffer()).byteLength>1000,true);
  assert.equal((await post('/api/spaces',{title:'Não autorizado'},{Origin:'https://example.org'})).status,403);
  assert.equal((await post('/api/spaces',{title:'Não autorizado'},{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await (await fetch(base+'/api/hub?day=2026-11-17')).json()).spaces.length,0);
});

test('API adiciona vagas manuais, previne duplicatas e mantém descarte',async()=>{
  const endpoint='/api/opportunities';
  const job={company:'Estúdio Exemplo',title:'Motion Designer',source_url:'https://example.org/jobs/42?utm_source=test',location:'Remoto'};
  assert.equal((await post(endpoint,job,{Origin:'https://example.org'})).status,403);
  assert.equal((await post(endpoint,job,{'x-csrf-token':'invalid'})).status,403);
  assert.equal((await post(endpoint,{company:'Estúdio',title:'Design',source_url:'file:///vagas'})).status,400);
  assert.equal((await post(endpoint,{company:'Estúdio',title:'Design',source_url:'http://localhost/test'})).status,400);
  const created=await post(endpoint,job);
  assert.equal(created.status,200);
  const result=await created.json();
  assert.equal(result.created,true);
  const list=await (await fetch(base+endpoint)).json();
  const saved=list.items.find(item=>item.id===result.id);
  assert.equal(saved.company,job.company);
  assert.equal(saved.source_url,'https://example.org/jobs/42');
  assert.equal(saved.source,'Adicionada manualmente');
  assert.equal(saved.channel,'manual');
  assert.equal(saved.status,'pending_review');
  assert.equal(saved.verified_at,null);
  assert.deepEqual(await (await post(endpoint,{...job,source_url:'https://example.org/jobs/42'})).json(),{id:result.id,created:false});
  assert.equal((await post(`${endpoint}/${result.id}/reject`,{})).status,200);
  assert.equal((await post(`${endpoint}/${result.id}/delete`,{})).status,200);
  const dismissed=await (await post(endpoint,job)).json();
  assert.equal(dismissed.created,false);
  assert.equal(dismissed.dismissed,true);
});

test('API gerencia espaços com checklists e remoção',async()=>{
  const create=await post('/api/spaces',{title:'Rotina criativa',description:'Notas pessoais'});
  assert.equal(create.status,200);
  const {id}=await create.json();
  const item=await post(`/api/spaces/${id}/items`,{kind:'check',title:'Publicar projeto'});
  assert.equal(item.status,200);
  const {id:itemId}=await item.json();
  assert.equal((await post(`/api/spaces/${id}/items/${itemId}/toggle`,{done:true})).status,200);
  let data=await (await fetch(base+'/api/hub?day=2026-11-17')).json();
  assert.equal(data.spaces.find(s=>s.id===id).items[0].done,1);
  assert.equal((await post(`/api/spaces/${id}/delete`,{})).status,200);
  data=await (await fetch(base+'/api/hub?day=2026-11-17')).json();
  assert.equal(data.spaces.length,0);
});

test('API persiste organização da visão geral e exige CSRF',async()=>{
  const endpoint='/api/preferences/overview-layout';
  const custom={main:['jobs','routine','pc'],aside:['tasks','finance']};
  assert.equal((await post(endpoint,custom,{Origin:'https://example.org'})).status,403);
  assert.equal((await post(endpoint,custom,{'x-csrf-token':'incorrect'})).status,403);
  const invalid=await post(endpoint,{main:['jobs','jobs'],aside:['tasks','routine','finance']});
  assert.equal(invalid.status,400);
  assert.equal((await post(endpoint,custom)).status,200);
  const stored=await (await fetch(base+'/api/hub?day=2026-11-17')).json();
  assert.deepEqual(stored.overview_layout,custom);
  assert.equal((await post(endpoint,{main:['jobs','tasks'],aside:['routine','finance','pc']})).status,200);
});

test('preferências de vagas começam neutras, persistem e validam dados com CSRF',async()=>{
  const endpoint='/api/preferences/jobs';
  const before=await (await fetch(base+'/api/hub?day=2026-11-17')).json();
  assert.equal(before.job_preferences.keywords,'');
  assert.equal(before.job_preferences.remote_only,false);
  const custom={keywords:'UX, produto',excluded_terms:'telemarketing',localities:'Recife, Brasil',remote_only:true,exclude_senior:true,exclude_unpaid:true,min_score:75};
  assert.equal((await post(endpoint,custom,{Origin:'https://example.org'})).status,403);
  assert.equal((await post(endpoint,custom,{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await post(endpoint,{...custom,min_score:200})).status,400);
  assert.equal((await post(endpoint,{...custom,remote_only:'true'})).status,400);
  const saved=await post(endpoint,custom);
  assert.equal(saved.status,200);
  assert.deepEqual((await saved.json()).job_preferences,custom);
  const after=await (await fetch(base+'/api/hub?day=2026-11-17')).json();
  assert.deepEqual(after.job_preferences,custom);
});
