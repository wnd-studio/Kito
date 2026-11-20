import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_JOB_PREFERENCES } from '../job-preferences.mjs';

const folder = mkdtempSync(join(tmpdir(), 'kito-search-'));
process.env.VAGAS_DB_PATH = join(folder, 'search.sqlite');
const core = await import('../core.mjs');
const hub = await import('../hub.mjs');
const { searchJobs } = await import('../job-search.mjs');
after(() => {
  hub.closeHub();
  core.close();
  rmSync(folder, { recursive: true, force: true });
});

const at = new Date('2026-11-20T12:00:00Z');
const job = (id, changes = {}) => ({
  title: 'Motion & Video Designer', company_name: 'Creative Studio',
  candidate_required_location: 'Worldwide',
  description: '<p>After Effects, Premiere e animação de vídeos.</p>',
  url: `https://remotive.com/remote-jobs/design/motion-${id}`,
  job_type: 'full_time', ...changes
});
const fetchJobs = (jobs, page = '<h1>Motion &amp; Video Designer</h1>') => async url => {
  if (String(url).includes('api/remote-jobs')) return { ok: true, json: async () => ({ jobs }) };
  return { ok: true, text: async () => page };
};

test('verifica título com entidade HTML, grava vaga e rejeita duplicata', async () => {
  const fetchImpl = fetchJobs([job('valid')]);
  const first = await searchJobs({ fetchImpl, at, preferences: LEGACY_JOB_PREFERENCES });
  assert.equal(first.added, 1);
  const second = await searchJobs({ fetchImpl, at, preferences: LEGACY_JOB_PREFERENCES });
  assert.equal(second.added, 0);
  assert.equal(second.duplicates, 1);
  const records = core.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'pending_review');
  assert.ok(records[0].verified_at);
});

test('exclui anúncios inativos, links inválidos e localizações restritas', async () => {
  const values = [
    job('removed'),
    job('unsafe', { url: 'https://example.net/job' }),
    job('canada', { candidate_required_location: 'Canada Only' })
  ];
  const fetchImpl = fetchJobs(values, '<h1>This job has been removed</h1>');
  const result = await searchJobs({ fetchImpl, at, preferences: LEGACY_JOB_PREFERENCES });
  assert.equal(result.added, 0);
  assert.equal(result.excluded, 3);
  assert.equal(core.list().length, 1);
});

test('registra falhas da fonte sem criar vagas', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });
  await assert.rejects(searchJobs({ fetchImpl, at, preferences: LEGACY_JOB_PREFERENCES }), /HTTP 503/);
  assert.equal(core.recentRuns()[0].status, 'failed');
  assert.equal(core.list().length, 1);
});
