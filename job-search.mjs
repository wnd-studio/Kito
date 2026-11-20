import { ingest, startRun, finishRun } from './core.mjs';
import { getJobPreferences } from './hub.mjs';
import { assessJob } from './job-match.mjs';
import { prepareApplication } from './application-prep.mjs';

const SOURCE = 'Remotive';
const SEARCH_URL = 'https://remotive.com/api/remote-jobs?limit=250';
const rolePattern = /\b(motion|animat(?:ion|or)|video|graphic design(?:er)?|visual design(?:er)?|brand design(?:er)?|creative design(?:er)?|illustrat(?:ion|or)|multimedia|content creator|art director|designer grafico|design grafico|editor de video|edicao de video|audiovisual)\b/i;
const excludedRoles = /\b(product designer|ux designer|ui designer|ux\/ui|interior designer|fashion designer|web designer|industrial designer|engineering|architect|developer)\b/i;
const eligibleLocation = /\b(worldwide|anywhere|global|brazil|brasil|latam|latin america|south america|americas)\b/i;

function plainText(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|li|h\d|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const point = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&(?:nbsp|amp|quot|apos|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/gi, entity => ({
      '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'",
      '&rsquo;': "'", '&lsquo;': "'", '&rdquo;': '"', '&ldquo;': '"',
      '&ndash;': '-', '&mdash;': '-'
    })[entity.toLowerCase()])
    .replace(/\s+/g, ' ').trim();
}

function comparableTitle(value) {
  return plainText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

export async function searchJobs({ fetchImpl = fetch, preferences = getJobPreferences(), at = new Date() } = {}) {
  const runId = startRun('Busca manual pelo Kito · Remotive');
  let found = 0;
  let added = 0;
  let duplicates = 0;
  let excluded = 0;
  try {
    const response = await fetchImpl(SEARCH_URL, {
      headers: { Accept: 'application/json' }, redirect: 'error',
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw Error(`Fonte de vagas indisponível (HTTP ${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data.jobs)) throw Error('A fonte de vagas retornou dados inválidos.');
    found = data.jobs.length;
    for (const job of data.jobs) {
      const title = String(job.title || '').trim();
      const location = String(job.candidate_required_location || '').trim();
      if (!rolePattern.test(title) || excludedRoles.test(title) || !eligibleLocation.test(location)) {
        excluded++;
        continue;
      }
      const description = plainText(job.description).slice(0, 8000);
      // A listagem da API pode conter anúncios removidos. Confirme o link
      // público do anúncio antes de registrar a vaga como verificada.
      let jobUrl;
      try {
        jobUrl = new URL(String(job.url || ''));
        if (jobUrl.protocol !== 'https:' || !['remotive.com', 'www.remotive.com'].includes(jobUrl.hostname)) {
          excluded++;
          continue;
        }
        const page = await fetchImpl(jobUrl.href, { redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!page.ok || !comparableTitle(await page.text()).includes(comparableTitle(title))) {
          excluded++;
          continue;
        }
      } catch {
        excluded++;
        continue;
      }
      const original = {
        company: String(job.company_name || '').trim(), title,
        source: SOURCE, source_url: jobUrl.href, application_url: jobUrl.href,
        location: `Remoto · ${location}`, contract_type: String(job.job_type || 'Remoto'),
        compensation: String(job.salary || ''), requirements: description.slice(0, 2000) || 'Ver requisitos no anúncio original.',
        description,
        match_reason: `Área criativa identificada no cargo. A localização informada pela fonte inclui ${location}. Confira os requisitos antes de candidatar-se.`,
        channel: 'form',
        verification: {
          status: 'verified', checked_at: at.toISOString(),
          notes: `Anúncio individual aberto na Remotive em ${at.toISOString()} e título confirmado. A listagem informa localização ${location}. Confirme os demais requisitos com o recrutador.`
        }
      };
      if (!original.company || !original.source_url) { excluded++; continue; }
      const prepared = prepareApplication(original, { portfolio: 'https://wnd.net.br' });
      const assessment = assessJob(prepared, at, preferences);
      if (!assessment.accepted) { excluded++; continue; }
      const result = ingest({ ...prepared, match_score: assessment.score });
      if (result.created) added++;
      else duplicates++;
      if (added >= 10) break;
    }
    finishRun(runId, 'completed', found, added, `${duplicates} repetidas, ${excluded} fora do perfil · Remotive`);
    return { found, added, duplicates, excluded, source: SOURCE };
  } catch (error) {
    finishRun(runId, 'failed', found, added, `Busca manual: ${error.message}`);
    throw error;
  }
}
