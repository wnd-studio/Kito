// Bridge para a automação Codex: importa o resultado de uma busca e registra a execução.
// Uso: node daily-import.mjs resultado.json [nota]
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { ingest, startRun, finishRun, close } from './core.mjs';
import { assessJob } from './job-match.mjs';
import { getJobPreferences } from './hub.mjs';
import { prepareApplication } from './application-prep.mjs';

const [file, ...notes] = process.argv.slice(2);
if (!file) {
  console.error('Uso: node daily-import.mjs caminho.json|caminho.ndjson [nota]');
  process.exit(2);
}

let runId;
let found = 0;
let added = 0;
let alreadyPresent = 0;
const errors = [];
const newItems = [];
const filteredOut = [];
const sources = {};

try {
  runId = startRun(notes.join(' ') || 'Busca diária via Codex');
  const raw = readFileSync(file, 'utf8');
  const parsed = extname(file).toLowerCase() === '.ndjson'
    ? raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    : JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  found = items.length;
  const preferences = getJobPreferences();
  for (const original of items) {
    try {
      const item = prepareApplication(original);
      if (!item?.company || !item?.title) throw Error('Empresa e cargo são obrigatórios.');
      const assessment = assessJob(item, new Date(), preferences);
      if (!assessment.accepted) {
        filteredOut.push({ company: String(item?.company ?? '').slice(0, 200), title: String(item?.title ?? '').slice(0, 200), reason: assessment.reason });
        continue;
      }
      const result = ingest({ ...item, match_score: assessment.score });
      if (result.created) {
        added++;
        const source = String(item.source).trim();
        sources[source] = (sources[source] || 0) + 1;
        newItems.push({ id: result.id, company: item.company, title: item.title, match_score: assessment.score, source });
      }
      else alreadyPresent++;
    } catch (error) {
      errors.push({ company: String(original?.company ?? '').slice(0, 200), title: String(original?.title ?? '').slice(0, 200), reason: error.message });
    }
  }
  const status = errors.length ? 'failed' : 'completed';
  finishRun(runId, status, found, added, `${alreadyPresent} duplicadas; ${filteredOut.length} fora do filtro; ${errors.length} falhas de importação`);
  console.log(JSON.stringify({ run_id: runId, status, found, added, already_present: alreadyPresent, filtered_out: filteredOut, sources_imported: sources, new_items: newItems, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  if (runId !== undefined) {
    try { finishRun(runId, 'failed', found, added, error.message); } catch { /* preservar erro original */ }
  }
  console.error(`Falha na importação diária: ${error.message}`);
  process.exitCode = 1;
} finally {
  close();
}
