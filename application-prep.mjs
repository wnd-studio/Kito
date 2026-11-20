import { existsSync } from 'node:fs';
export function prepareApplication(item, { resumePath = '', portfolio = '', profileSummary = '' } = {}) {
  const prepared = { ...item };
  const company = String(prepared.company || '').trim();
  const title = String(prepared.title || '').trim();
  if (!company || !title) return prepared;

  if (!String(prepared.cover_letter || '').trim()) {
    const profile = String(profileSummary || '').trim();
    const portfolioLink = String(portfolio || '').trim();
    prepared.cover_letter = `Olá, equipe da ${company}.\n\nTenho interesse na oportunidade de ${title}. ${profile || '[Descreva aqui sua experiência relacionada à vaga.]'}\n\n${portfolioLink ? `Meu portfólio está em ${portfolioLink}.\n\n` : ''}Fico à disposição para conversar.\n\nObrigado pela atenção.`;
  }
  if (prepared.channel === 'email' && !String(prepared.subject || '').trim()) {
    prepared.subject = `Candidatura — ${title}`;
  }
  if (!String(prepared.resume_path || '').trim() && resumePath && existsSync(resumePath)) {
    prepared.resume_path = resumePath;
  }
  return prepared;
}
