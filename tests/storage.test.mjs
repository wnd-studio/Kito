import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder=mkdtempSync(join(tmpdir(),'wnd-central-storage-'));
process.env.VAGAS_DB_PATH=join(folder,'test.sqlite');
const core=await import('../core.mjs');
const hub=await import('../hub.mjs');

after(()=>{
  hub.closeHub();
  core.close();
  rmSync(folder,{recursive:true,force:true});
});

test('vagas: deduplicação, requisitos de aprovação e confirmação de envio',()=>{
  const item={
    company:'Estúdio de teste',title:'Motion Designer',source:'Teste automatizado',
    source_url:'https://example.org/jobs/1?utm_source=demo',
    application_url:'https://example.org/apply',
    channel:'email',recipient:'recruiting@example.org',subject:'Candidatura',
    cover_letter:'Olá, gostaria de me candidatar à vaga.',
  };
  const first=core.ingest(item);
  assert.equal(first.created,true);
  assert.equal(core.ingest({...item,source_url:'https://example.org/jobs/1'}).created,false);
  assert.equal(core.list().length,1);
  assert.throws(()=>core.decide(first.id,'approved'),/Verifique a vaga/);
  core.edit(first.id,{cover_letter:'Olá, tenho experiência com edição e motion design.'});
  assert.throws(()=>core.transition(first.id,'submitted','Ref: 1234567890'),/aprovação individual/);
  core.decide(first.id,'rejected');
  assert.equal(core.get(first.id).status,'rejected');
  assert.throws(()=>core.decide(first.id,'approved'),/já recebeu/);
  const second=core.ingest({...item,source_url:'https://example.org/jobs/2',
    verification:{status:'verified',checked_at:new Date().toISOString(),notes:'Anúncio conferido na página de vagas oficial.'}});
  assert.equal(core.decide(second.id,'approved').status,'approved');
  assert.equal(core.queue().length,1);
  assert.throws(()=>core.transition(second.id,'submitted','Confirmação ID ABC123456'),/Reserve a candidatura/);
  assert.equal(core.claimSubmission(second.id).status,'submitting');
  assert.equal(core.queue().length,0);
  assert.equal(core.list({status:'submitting'}).length,1);
  assert.throws(()=>core.claimSubmission(second.id),/já está em processamento/);
  assert.throws(()=>core.transition(second.id,'submitted','ok'),/confirmação verificável/);
  assert.equal(core.transition(second.id,'submitted','Confirmação ID ABC123456').status,'submitted');
  assert.equal(core.queue().length,0);
});

test('vagas aprovadas podem ser rejeitadas antes do envio',()=>{
  const verified={
    status:'verified',checked_at:new Date().toISOString(),
    notes:'Anúncio conferido e candidatura ainda não enviada.'
  };
  const email=core.ingest({
    company:'Estúdio aprovado',title:'Editor de vídeo',source:'Teste automatizado',
    source_url:'https://example.org/jobs/rejection-approved',application_url:'https://example.org/apply',
    channel:'email',recipient:'recruiting@example.org',subject:'Candidatura',
    cover_letter:'Olá, gostaria de me candidatar.',verification:verified
  });
  assert.equal(core.decide(email.id,'approved').status,'approved');
  assert.equal(core.queue().some(item=>item.id===email.id),true);
  assert.equal(core.decide(email.id,'rejected').status,'rejected');
  assert.equal(core.queue().some(item=>item.id===email.id),false);

  const form=core.ingest({
    company:'Estúdio em análise',title:'Designer gráfico',source:'Teste automatizado',
    source_url:'https://example.org/jobs/rejection-needs-action',application_url:'https://example.org/apply',
    channel:'form',cover_letter:'Olá, gostaria de me candidatar.',verification:verified
  });
  core.decide(form.id,'approved');
  core.transition(form.id,'needs_action','Inscrição externa ainda não iniciada.');
  assert.equal(core.decide(form.id,'rejected').status,'rejected');

  const processing=core.ingest({
    company:'Estúdio em processamento',title:'Editor de vídeo',source:'Teste automatizado',
    source_url:'https://example.org/jobs/rejection-processing',application_url:'https://example.org/apply',
    channel:'email',recipient:'recruiting@example.org',subject:'Candidatura',
    cover_letter:'Olá, gostaria de me candidatar.',verification:verified
  });
  core.decide(processing.id,'approved');
  core.claimSubmission(processing.id);
  assert.throws(()=>core.decide(processing.id,'rejected'),/em processamento ou já enviada/);

  const submitted=core.ingest({
    company:'Estúdio com candidatura enviada',title:'Editor de vídeo',source:'Teste automatizado',
    source_url:'https://example.org/jobs/rejection-submitted',application_url:'https://example.org/apply',
    channel:'email',recipient:'recruiting@example.org',subject:'Candidatura',
    cover_letter:'Olá, gostaria de me candidatar.',verification:verified
  });
  core.decide(submitted.id,'approved');
  core.claimSubmission(submitted.id);
  core.transition(submitted.id,'submitted','Confirmação de envio ABC123456');
  assert.throws(()=>core.decide(submitted.id,'rejected'),/em processamento ou já enviada/);
});

test('tarefas, rotina e finanças são persistidos no hub',()=>{
  const task=hub.addTask({title:'Revisar portfólio',priority:'high'});
  hub.toggleTask(task.id,true);
  assert.equal(hub.getHub('2026-11-17').tasks.find(t=>t.id===task.id).done,1);
  const routine=hub.addRoutine({title:'Caminhar',time:'08:00'});
  hub.routineDay(routine.id,'2026-11-17',true);
  assert.equal(hub.getHub('2026-11-17').routines.find(r=>r.id===routine.id).done,1);
  assert.equal(hub.getHub('2026-11-18').routines.find(r=>r.id===routine.id).done,0);
  const tx=hub.addTransaction({description:'Freelance',type:'income',amount_cents:13750,occurred_on:'2026-11-17'});
  assert.equal(hub.getHub('2026-11-17').finance.income,13750);
  hub.deleteTransaction(tx.id);hub.deleteRoutine(routine.id);hub.deleteTask(task.id);
  assert.equal(hub.getHub('2026-11-17').finance.income,0);
});

test('layout personalizável valida e persiste a ordem dos cinco cards',()=>{
  const original={main:['jobs','tasks'],aside:['routine','finance','pc']};
  assert.deepEqual(hub.getOverviewLayout(),original);
  assert.deepEqual(hub.getHub('2026-11-17').overview_layout,original);
  assert.throws(()=>hub.setOverviewLayout({main:['jobs','jobs'],aside:['routine','finance','pc']}),/sem repetições/);
  assert.throws(()=>hub.setOverviewLayout({main:['jobs'],aside:['routine','finance','pc']}),/cinco cards/);
  assert.throws(()=>hub.setOverviewLayout({main:['jobs','tasks'],aside:['routine','finance','extra']}),/cinco cards/);
  assert.throws(()=>hub.setOverviewLayout({main:['jobs','tasks'],aside:['routine','finance','pc'],extra:[]}),/inválida/);
  const custom={main:['routine','jobs','pc'],aside:['tasks','finance']};
  assert.deepEqual(hub.setOverviewLayout(custom),custom);
  assert.deepEqual(hub.getHub('2026-11-17').overview_layout,custom);
  assert.deepEqual(hub.getOverviewLayout(),custom);
  hub.setOverviewLayout(original);
  assert.deepEqual(hub.getOverviewLayout(),original);
});

test('espaços: notas, checklists, links, edição e exclusão em cascata',()=>{
  const s=hub.addSpace({title:'Projetos',description:'Acompanhamento'});
  const n=hub.addSpaceItem(s.id,{kind:'note',title:'Ideias',content:'Testar animação'});
  const c=hub.addSpaceItem(s.id,{kind:'check',title:'Render final'});
  const l=hub.addSpaceItem(s.id,{kind:'link',title:'Referência',url:'https://example.org/ref'});
  assert.throws(()=>hub.addSpaceItem(s.id,{kind:'link',title:'Inválido',url:'javascript:alert(1)'}),/HTTP ou HTTPS/);
  assert.throws(()=>hub.toggleSpaceItem(s.id,n.id,true),/inexistente/);
  hub.toggleSpaceItem(s.id,c.id,true);
  hub.editSpace(s.id,{title:'Projetos em andamento',description:'Revisado'});
  let space=hub.getHub('2026-11-17').spaces.find(x=>x.id===s.id);
  assert.equal(space.title,'Projetos em andamento');
  assert.equal(space.items.find(x=>x.id===c.id).done,1);
  assert.equal(space.items.find(x=>x.id===l.id).url,'https://example.org/ref');
  hub.deleteSpaceItem(s.id,n.id);
  hub.deleteSpace(s.id);
  assert.equal(hub.getHub('2026-11-17').spaces.length,0);
  assert.throws(()=>hub.toggleSpaceItem(s.id,c.id,false),/inexistente/);
});
