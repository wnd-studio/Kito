import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('integração da busca registra execuções, elimina duplicações e mantém falhas visíveis', () => {
  const folder = mkdtempSync(join(tmpdir(), 'wnd-daily-'));
  const root = resolve(import.meta.dirname, '..');
  const env = { ...process.env, VAGAS_DB_PATH: join(folder, 'daily.sqlite') };
  const file = join(folder, 'results.json');
  const run = (script, args) => spawnSync(process.execPath, [script, ...args], {
    cwd: root, env, encoding: 'utf8', windowsHide: true
  });
  const opportunity = {
    company: 'Empresa de Teste', title: 'Motion Designer',
    source_url: 'https://example.com/careers/motion?utm_source=test',
    application_url: 'https://example.com/apply/motion', source: 'Site da empresa',
    requirements: 'Motion graphics e After Effects para vídeos institucionais.',
    match_reason: 'Experiência com motion e edição de vídeo em After Effects.',
    location: 'Remoto, Brasil',
    channel: 'form', verification: { status: 'verified', checked_at: new Date().toISOString(), notes: 'Anúncio de teste conferido na página original e com aplicação aberta.' },
    cover_letter: 'Apresentação exclusivamente para teste.'
  };
  try {
    writeFileSync(file, JSON.stringify([opportunity]));
    const first = run('daily-import.mjs', [file, 'Teste de integração']);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout).added, 1);
    assert.equal(JSON.parse(first.stdout).new_items.length, 1);
    assert.equal(JSON.parse(first.stdout).new_items[0].company, 'Empresa de Teste');
    assert.ok(JSON.parse(first.stdout).new_items[0].match_score >= 60);

    const repeat = run('daily-import.mjs', [file]);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.deepEqual(JSON.parse(repeat.stdout).already_present, 1);
    assert.deepEqual(JSON.parse(repeat.stdout).new_items, []);

    writeFileSync(file, JSON.stringify([
      { ...opportunity, source: 'LinkedIn', source_url: 'https://linkedin.com/jobs/view/12345' },
      { ...opportunity, title: 'Vaga voluntária', contract_type: 'Não remunerado', source_url: 'https://example.com/senior' },
      { ...opportunity, title: 'Estágio em Design Gráfico', contract_type: 'Estágio remunerado',
        requirements: 'Photoshop e Illustrator para peças gráficas.',
        source_url: 'https://example.com/estagio', match_score: 91 }
    ]));
    const filtered = run('daily-import.mjs', [file]);
    assert.equal(filtered.status, 0, filtered.stderr);
    const filteredSummary = JSON.parse(filtered.stdout);
    assert.equal(filteredSummary.already_present, 1);
    assert.equal(filteredSummary.filtered_out.length, 1);
    assert.equal(filteredSummary.added, 1);
    assert.ok(filteredSummary.new_items[0].match_score >= 60);
    assert.ok(filteredSummary.new_items[0].match_score <= 91);

    const ranked = run('cli.mjs', ['list', 'pending_review']);
    assert.equal(ranked.status, 0, ranked.stderr);
    assert.equal(JSON.parse(ranked.stdout)[0].title, 'Estágio em Design Gráfico');

    writeFileSync(file, JSON.stringify([opportunity, { company: 'Incompleta' }]));
    const partial = run('daily-import.mjs', [file]);
    assert.equal(partial.status, 1);
    const summary = JSON.parse(partial.stdout);
    assert.equal(summary.status, 'failed');
    assert.equal(summary.found, 2);
    assert.equal(summary.added, 0);
    assert.equal(summary.errors.length, 1);

    const runs = run('cli.mjs', ['runs']);
    assert.equal(runs.status, 0, runs.stderr);
    const history = JSON.parse(runs.stdout);
    assert.equal(history.length, 4);
    assert.deepEqual(history.map(r => r.status), ['failed', 'completed', 'completed', 'completed']);

    const queue = run('cli.mjs', ['queue']);
    assert.equal(queue.status, 0, queue.stderr);
    assert.deepEqual(JSON.parse(queue.stdout), []);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
