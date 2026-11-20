// Preferências da triagem local. Uma instalação nova começa sem filtros pessoais.
export const DEFAULT_JOB_PREFERENCES = Object.freeze({
  keywords: '',
  excluded_terms: '',
  localities: '',
  remote_only: false,
  exclude_senior: false,
  exclude_unpaid: true,
  min_score: 60
});

// Compatibilidade com o filtro que era aplicado antes de existir configuração.
export const LEGACY_JOB_PREFERENCES = Object.freeze({
  keywords: 'motion, animação, editor de vídeo, edição, video edit, design, audiovisual, reels, shorts, after effects, premiere, blender, illustrator, photoshop, criativo',
  excluded_terms: 'dayz',
  localities: 'Belém, Ananindeua, Pará',
  remote_only: false,
  exclude_senior: true,
  exclude_unpaid: true,
  min_score: 60
});

export const searchTerms = value => String(value || '').split(/[,\n]/).map(term => term.trim()).filter(Boolean);

export function validateJobPreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Preferências de vagas inválidas.');
  const result = {};
  for (const key of ['keywords', 'excluded_terms', 'localities']) {
    if (typeof input[key] !== 'string' || input[key].length > 750) throw Error(`Campo ${key} inválido.`);
    const terms = searchTerms(input[key]);
    if (terms.length > 25 || terms.some(term => term.length > 80)) throw Error(`Limite de termos excedido em ${key}.`);
    result[key] = terms.join(', ');
  }
  for (const key of ['remote_only', 'exclude_senior', 'exclude_unpaid']) {
    if (typeof input[key] !== 'boolean') throw Error(`Campo ${key} deve ser verdadeiro ou falso.`);
    result[key] = input[key];
  }
  if (!Number.isInteger(input.min_score) || input.min_score < 0 || input.min_score > 100) {
    throw Error('A nota mínima deve estar entre 0 e 100.');
  }
  result.min_score = input.min_score;
  return result;
}
