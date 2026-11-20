import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessJob } from '../job-match.mjs';
import { LEGACY_JOB_PREFERENCES, DEFAULT_JOB_PREFERENCES } from '../job-preferences.mjs';

const time = new Date('2026-11-18T12:00:00Z');
const opportunity = {
  company: 'Agência Exemplo', title: 'Estágio em Design Gráfico',
  source: 'Site oficial', source_url: 'https://example.com/jobs/1', application_url: 'https://example.com/apply/1',
  location: 'Belém, Pará', contract_type: 'Estágio remunerado',
  requirements: 'Produção de artes no Photoshop e Illustrator para redes sociais.',
  description: 'Apoio à equipe de design gráfico.',
  match_reason: 'Cursa Design Gráfico e já usa Photoshop e Illustrator.',
  cover_letter: 'Olá! Tenho interesse na oportunidade.',
  verification: { status: 'verified', checked_at: '2026-11-18T10:00:00Z', notes: 'Anúncio oficial revisado, candidatura aberta e elegibilidade conferida.' }
};

test('estágio local compatível é aceito e pontuado', () => {
  const result = assessJob(opportunity, time);
  assert.equal(result.accepted, true);
  assert.ok(result.score >= 60);
});

test('rejeita senioridade, local distante, anúncios antigos e falta de verificação', () => {
  const variations = [
    { title: 'Senior Graphic Designer' },
    { location: 'Presencial em São Paulo - SP' },
    { location: 'Tampa, Florida, presencial' },
    { location: 'Recife - PE' },
    { location: 'Remote - United States' },
    { location: 'Remote', requirements: 'Motion em After Effects. Must be based in Canada.' },
    { verification: { ...opportunity.verification, checked_at: '2026-11-01T10:00:00Z' } },
    { verification: { ...opportunity.verification, status: 'unverified' } },
    { title: 'Vendedor de seguros', requirements: 'Prospecção e vendas.', description: 'Atendimento a clientes e venda de seguros.' }
  ];
  for (const variation of variations) {
    assert.equal(assessJob({ ...opportunity, ...variation }, time, LEGACY_JOB_PREFERENCES).accepted, false, JSON.stringify(variation));
  }
});

test('instalação nova aceita áreas diversas e respeita filtros configurados', () => {
  const senior={...opportunity,title:'Senior Software Engineer',requirements:'Node.js e arquitetura de APIs.',description:'Equipe de engenharia.'};
  assert.equal(assessJob(senior,time,DEFAULT_JOB_PREFERENCES).accepted,true);
  assert.equal(assessJob(senior,time,{...DEFAULT_JOB_PREFERENCES,exclude_senior:true}).accepted,false);
  assert.equal(assessJob({...opportunity,contract_type:'Não remunerado'},time,DEFAULT_JOB_PREFERENCES).accepted,false);
});

test('pontuação editorial baixa impede importação mesmo com palavras-chave', () => {
  assert.equal(assessJob({ ...opportunity, match_score: 48 }, time).accepted, false);
  const assessed = assessJob({ ...opportunity, match_score: 88 }, time);
  assert.equal(assessed.accepted, true);
  assert.ok(assessed.score <= 88);
  assert.ok(assessed.score <= assessJob(opportunity, time).score);
});

test('aceita estágios em diferentes grafias e remoto elegível do Brasil', () => {
  for (const title of ['Estagiário de Design Gráfico', 'Estagiária de Design Gráfico', 'Design Intern', 'Graphic Design Internship']) {
    assert.equal(assessJob({ ...opportunity, title, location: 'Remoto, Brasil' }, time).accepted, true, title);
  }
});
