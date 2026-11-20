// Triagem configurável dos resultados pesquisados pelo agente.
// A pontuação textual não substitui a conferência da vaga e dos requisitos.
import { DEFAULT_JOB_PREFERENCES, searchTerms } from './job-preferences.mjs';
const fold = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function assessJob(item, at = new Date(), preferences = DEFAULT_JOB_PREFERENCES) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { accepted: false, reason: 'Registro inválido.' };
  const title = fold(item.title);
  const requirements = fold(item.requirements);
  const description = fold(item.description);
  const location = fold(item.location);
  const contract = fold(item.contract_type);
  const text = `${title} ${requirements} ${description}`;
  const verification = item.verification;
  const checked = new Date(verification?.checked_at);

  if (!item.source || !item.source_url || !item.application_url || !item.match_reason || !item.requirements || !item.cover_letter) {
    return { accepted: false, reason: 'Faltam origem, links, requisitos, motivo de aderência ou apresentação.' };
  }
  if (verification?.status !== 'verified' || String(verification.notes ?? '').trim().length < 20 || Number.isNaN(checked.getTime())) {
    return { accepted: false, reason: 'Anúncio sem evidência suficiente de verificação.' };
  }
  const verificationAge = at.getTime() - checked.getTime();
  if (verificationAge < -10 * 60000 || verificationAge > 7 * 86400000) {
    return { accepted: false, reason: 'Verificação antiga ou com data futura. Confira a vaga novamente.' };
  }
  if (item.deadline && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline) && item.deadline < at.toISOString().slice(0, 10)) {
    return { accepted: false, reason: 'O prazo de candidatura terminou.' };
  }
  const keywords=searchTerms(preferences.keywords).map(fold);
  const excluded=searchTerms(preferences.excluded_terms).map(fold);
  const localities=searchTerms(preferences.localities).map(fold);
  if (excluded.some(term => text.includes(term))) return { accepted: false, reason: 'Termo excluído nas suas preferências.' };
  if (preferences.exclude_senior && /\b(senior|sr|lead|head|principal|diretor|gerente|coordenador|manager)\b/.test(title)) {
    return { accepted: false, reason: 'Cargo de liderança ou senioridade incompatível.' };
  }
  if (preferences.exclude_unpaid && /\b(unpaid|voluntari[oa]|nao remunerad[oa])\b/.test(`${contract} ${fold(item.compensation)}`)) {
    return { accepted: false, reason: 'Oportunidade sem remuneração.' };
  }
  const matchedInTitle=keywords.filter(term => title.includes(term));
  const matchedInText=keywords.filter(term => text.includes(term));
  if (keywords.length && !matchedInText.length) return { accepted: false, reason: 'Cargo fora das áreas escolhidas nas preferências.' };

  const mode = `${location} ${contract}`;
  const remote = /remot|home office|anywhere|worldwide|online|trabalho a distancia/.test(mode);
  const local = localities.some(term => location.includes(term));
  if (preferences.remote_only && !remote) return { accepted: false, reason: 'Vaga fora do modo remoto escolhido.' };
  const eligibility = `${location} ${requirements}`;
  const restrictedRegion = /(?:\b(?:us|usa|united states|canada|uk|united kingdom|europe|emea)\b.{0,30}\b(?:only|exclusiv[oa]?|somente)\b|\b(?:only|exclusiv[oa]?|somente)\b.{0,30}\b(?:us|usa|united states|canada|uk|united kingdom|europe|emea)\b|must (?:be based|reside|live) in (?:the )?(?:us|usa|united states|canada|uk|united kingdom|europe|emea))/.test(eligibility);
  const regionBoundRemote = remote && /\b(?:us|usa|united states|canada|uk|united kingdom|europe|emea)\b/.test(location)
    && !/\b(?:brazil|brasil|latam|latin america|worldwide|anywhere|global)\b/.test(location);
  if (localities.length && (restrictedRegion || regionBoundRemote)) {
    return { accepted: false, reason: 'Restrição territorial incompatível com candidatura do Brasil.' };
  }
  const unspecifiedLocation = /^(?:|brasil|brazil|a definir|a combinar|nao informado|nao divulgad[oa]|nacional|latam)$/.test(location);
  if (localities.length && !remote && !local && (!unspecifiedLocation || /presencial|hibrid|on.site|on site/.test(mode))) {
    return { accepted: false, reason: 'Vaga presencial ou híbrida fora das regiões escolhidas.' };
  }

  const role = keywords.length ? (matchedInTitle.length ? 34 : 26) : 28;
  const skills = Math.min(40, role + Math.min(3, matchedInText.length) * 2);
  const junior = /estagi(?:o|ari[oa])|intern|junior|jr\b|assistente|trainee/.test(`${title} ${contract}`);
  const seniority = junior ? 20 : 14;
  const geography = remote || local ? 15 : 10;
  const pay = /\b(r\$|us\$|usd|eur|euro|salario|bolsa)\s*[\d.,]+/i.test(fold(item.compensation)) ? 10 : 5;
  const verificationPoints = verificationAge <= 3 * 86400000 ? 15 : 12;
  const calculatedScore = skills + seniority + geography + pay + verificationPoints;
  const statedScore = item.match_score === undefined || item.match_score === null ? null : Number(item.match_score);
  if (statedScore !== null && (!Number.isInteger(statedScore) || statedScore < 0 || statedScore > 100)) {
    return { accepted: false, reason: 'Pontuação declarada inválida.' };
  }
  // A avaliação editorial pode reduzir a nota, mas não elevar uma aderência
  // que os requisitos efetivamente identificados não sustentam.
  const score = statedScore === null ? calculatedScore : Math.min(statedScore, calculatedScore);
  if (score < preferences.min_score) return { accepted: false, score, reason: `Aderência abaixo de ${preferences.min_score}/100.` };
  return { accepted: true, score };
}
