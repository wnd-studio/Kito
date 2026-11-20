// Analisa exclusivamente transações já importadas para o SQLite local.
export const BANK_CATEGORIES = [
  'Alimentação', 'Entretenimento', 'Assinaturas e serviços', 'Moradia',
  'Transporte', 'Saúde', 'Educação', 'Compras', 'Tributos e taxas', 'Outras'
];

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const categoryRules = [
  ['Alimentação', /ifood|rappi|uber\s*eats|restaurante|lanchonete|pizzaria|padaria|cafeteria|supermercado|hipermercado|mercadinho|atacadao|assai|carrefour|pao de acucar|comida|aliment|food|grocer|restaurant|delivery|burger|acougue/],
  ['Entretenimento', /netflix|spotify|disney\+?|hbo|max\.com|prime\s*video|youtube\s*premium|steam|epic\s*games|playstation|xbox|cinema|ingresso|twitch|entertain|music\s*streaming|video\s*streaming|streaming|games|jogos/],
  ['Assinaturas e serviços', /adobe|creative\s*cloud|figma|canva|google\s*one|icloud|dropbox|microsoft\s*365|office\s*365|chatgpt|openai|github|notion|assinatura|subscription|digital\s*services|software|saas/],
  ['Moradia', /aluguel|condominio|energia|equatorial|eletrobras|saneamento|conta de agua|internet|provedor|fibra|vivo|claro|tim\b|oi\s*movel|housing|utilities|electric|water\s*bill|rent|telecom/],
  ['Transporte', /uber(?!\s*eats)|99pop|99\s*app|taxi|ride.hailing|combustivel|gasolina|posto|estacionamento|passagem|transporte|transport|mobility|fuel|metro|onibus/],
  ['Saúde', /farmacia|drogaria|hospital|clinica|dentista|medic|saude|health|pharmacy|insurance|laboratorio/],
  ['Educação', /faculdade|universidade|udemy|alura|escola|curso|educa|college|tuition/],
  ['Compras', /mercado\s*livre|mercadopago\s*loja|shopee|amazon(?!\s*prime\s*video)|magalu|magazine\s*luiza|lojas|shopping|ecommerce|retail/],
  ['Tributos e taxas', /imposto|taxa|tarifa|juros|tribut|fee|interest|tax\b|iof\b/]
];

const transferPattern = /(?:^|\b)(?:transferencia|transfer|ted\b|doc\b|pix\s+(?:enviado|recebido|para|de|transferencia)|resgate\s+de\s+investimento|aplicacao\s+em\s+investimento|pagamento\s+(?:de\s+)?fatura|pagto\s+(?:de\s+)?cartao|fatura\s+(?:do\s+)?cartao|credit\s+card\s+payment)(?:\b|$)/;
// Lojas e prestadores com identidade reconhecível mesmo quando o banco muda a descrição.
const subscriptionMerchants = [
  ['Spotify', /\bspotify\b/],
  ['Netflix', /\bnetflix\b/],
  ['Adobe', /\badobe\b|creative\s*cloud/],
  ['OpenAI / ChatGPT', /\bopenai\b|\bchatgpt\b/],
  ['Disney+', /\bdisney\b/],
  ['Prime Video', /prime\s*video/],
  ['YouTube Premium', /youtube\s*premium/],
  ['HBO Max', /\bhbo\b/],
  ['Figma', /\bfigma\b/],
  ['Canva', /\bcanva\b/],
  ['Google One', /google\s*one/],
  ['iCloud', /\bicloud\b/],
  ['Dropbox', /\bdropbox\b/],
  ['Microsoft 365', /microsoft\s*365|office\s*365/],
  ['GitHub', /\bgithub\b/],
  ['Notion', /\bnotion\b/]
];
const internalMovementPattern = /entre\s+(?:minhas\s+)?contas|mesma\s+titularidade|resgate\s+de\s+investimento|aplicacao\s+em\s+investimento/;
const refundPattern = /estorno|reembolso|devolucao|refund|chargeback/;

export function classifyBankTransaction(transaction) {
  const description = normalize(transaction.description);
  const original = normalize(transaction.category);
  const combined = `${description} ${original}`;
  if (transaction.category_override && BANK_CATEGORIES.includes(transaction.category_override)) return transaction.category_override;
  if (/\b(?:iof|juros|tarifa)\b/.test(description)) return 'Tributos e taxas';
  // A identificação de comerciantes tem prioridade sobre descrições genéricas do Pix.
  const matched = categoryRules.find(([, pattern]) => pattern.test(combined));
  if (matched) return matched[0];
  if (transferPattern.test(combined) || /^(pix|ted|doc)\b/.test(description) || /transfer|investment|investimento|credit card payment/.test(original)) return 'Transferências';
  return 'Outras';
}

export function transactionKind(transaction) {
  if (transaction.currency !== 'BRL' || !['BANK', 'CREDIT'].includes(transaction.account_type) ||
      /pending|scheduled|processing|cancel|rejected/i.test(transaction.status || '')) return 'ignored';
  const description = normalize(transaction.description);
  const sourceCategory = normalize(transaction.category);
  if (/(pagamento|pagto|pgt|payment|quitacao).{0,15}(fatura|cartao|credit card)|(fatura|cartao).{0,15}(pagamento|pagto|payment)/.test(description) ||
      /card.payment|bill.payment/.test(normalize(transaction.type)) ||
      /credit card payment/.test(sourceCategory)) return 'transfer';
  if (internalMovementPattern.test(description) || /same person transfer|mesma titularidade|between own accounts/.test(sourceCategory)) return 'transfer';
  if (transaction.account_type === 'BANK') {
    if (transaction.amount_cents > 0 && refundPattern.test(description)) return 'refund';
    return transaction.amount_cents < 0 ? 'expense' : transaction.amount_cents > 0 ? 'income' : 'ignored';
  }
  return transaction.amount_cents > 0 ? 'expense' : transaction.amount_cents < 0 ? 'refund' : 'ignored';
}

// Só confirma transferências entre bancos próprios quando existem as duas pontas importadas.
function matchedInternalTransfers(transactions) {
  const eligible = transactions.filter(t => t.account_type === 'BANK' &&
    transactionKind(t) !== 'ignored' && transactionKind(t) !== 'transfer' &&
    classifyBankTransaction(t) === 'Transferências');
  const byAmount = new Map();
  for (const t of eligible) {
    const amount = Math.abs(t.amount_cents);
    if (!byAmount.has(amount)) byAmount.set(amount, []);
    byAmount.get(amount).push(t);
  }
  const matched = new Set();
  for (const group of byAmount.values()) {
    for (const t of group) {
      if (matched.has(t.id)) continue;
      const other = group.find(candidate => !matched.has(candidate.id) && candidate.id !== t.id &&
        candidate.account_id !== t.account_id && candidate.amount_cents === -t.amount_cents &&
        Math.abs(Date.parse(candidate.occurred_on) - Date.parse(t.occurred_on)) <= 2 * 86400000);
      if (other) { matched.add(t.id); matched.add(other.id); }
    }
  }
  return matched;
}

function merchantName(description) {
  return normalize(description)
    .replace(/\b(?:pix|compra|debito|credito|cartao|pagamento|pagto|automatico|recorrente|online|visa|mastercard|elo|estabelecimento)\b/g, ' ')
    .replace(/\b(?:\d{2}\/\d{2}(?:\/\d{2,4})?|\d{4,}|[0-9a-f]{8,})\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function recurringMerchant(transaction) {
  const description = normalize(transaction.description);
  // Tributos, estornos e outras cobranças acessórias não são assinaturas separadas.
  if (/\b(?:iof|juros|tarifa|taxa|estorno|reembolso)\b/.test(description)) return null;
  const known = subscriptionMerchants.find(([, pattern]) => pattern.test(description));
  if (known) return { key: `subscription:${known[0]}`, merchant: known[0], known: true };
  const merchant = merchantName(transaction.description);
  if (merchant.length < 4) return null;
  return { key: `account:${transaction.account_id}:${merchant}`, merchant: transaction.description, known: false };
}

function nextMonth(date, offset = 1) {
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(year, month + offset, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

export function bankInsights(transactions, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Mês inválido.');
  let incomeCents = 0;
  let expenseCents = 0;
  const spending = new Map();
  const recurringCandidates = new Map();
  let importedThisMonth = 0;
  const internalTransfers = matchedInternalTransfers(transactions);

  for (const transaction of transactions) {
    const kind = transactionKind(transaction);
    if (kind === 'ignored' || kind === 'transfer' || internalTransfers.has(transaction.id)) continue;
    const category = classifyBankTransaction(transaction);
    const amount = Math.abs(transaction.amount_cents);
    if (transaction.occurred_on?.slice(0, 7) === month) {
      importedThisMonth++;
      if (kind === 'income') incomeCents += amount;
      if (kind === 'expense') {
        expenseCents += amount;
        spending.set(category, (spending.get(category) || 0) + amount);
      }
      if (kind === 'refund') {
        expenseCents -= amount;
        spending.set(category, (spending.get(category) || 0) - amount);
      }
    }
    if (kind !== 'expense' || category === 'Transferências' || transaction.occurred_on > `${month}-31`) continue;
    const identity = recurringMerchant(transaction);
    if (!identity) continue;
    if (!recurringCandidates.has(identity.key)) recurringCandidates.set(identity.key, { identity, payments: [] });
    recurringCandidates.get(identity.key).payments.push({ ...transaction, category, amount });
  }

  const recurring = [];
  for (const { identity, payments: entries } of recurringCandidates.values()) {
    const payments = [...entries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const months = new Set(payments.map(row => row.occurred_on.slice(0, 7)));
    if (months.size !== payments.length || months.size < 2) continue;
    const latest = payments.at(-1);
    if (!identity.known && payments.length < 3) continue;
    const recent = payments.slice(-Math.min(payments.length, 4));
    const intervals = recent.slice(1).map((payment, index) => {
      const previous = recent[index];
      const days = (Date.parse(`${payment.occurred_on}T12:00:00Z`) - Date.parse(`${previous.occurred_on}T12:00:00Z`)) / 86400000;
      const difference = Math.abs(payment.amount - previous.amount);
      return { days, similarAmount: difference <= Math.max(1500, Math.round(previous.amount * .3)) };
    });
    // Serviços reconhecidos podem falhar um mês, mudar o texto ou trocar o cartão.
    // Para outros comerciantes, exigimos três parcelas mensais com valores semelhantes.
    if (identity.known ? intervals.at(-1).days < 17 || intervals.at(-1).days > 95 :
      !intervals.every(({ days, similarAmount }) => days >= 25 && days <= 37 && similarAmount)) continue;
    let offset = 1;
    let nextDue = nextMonth(latest.occurred_on, offset);
    // Cobranças antigas demais não aparecem como compromissos atuais.
    if ((Date.parse(`${month}-01T12:00:00Z`) - Date.parse(`${latest.occurred_on}T12:00:00Z`)) > 80 * 86400000) continue;
    while (nextDue.slice(0, 7) < month) nextDue = nextMonth(latest.occurred_on, ++offset);
    const paidThisMonth = latest.occurred_on.slice(0, 7) === month;
    const estimatedCents = intervals.every(({ similarAmount }) => similarAmount)
      ? Math.round(recent.reduce((sum, entry) => sum + entry.amount, 0) / recent.length)
      : latest.amount;
    recurring.push({
      merchant: identity.merchant, category: latest.category, estimatedCents,
      nextDue, paidThisMonth, occurrences: payments.length,
      accountName: latest.account_name, accountId: latest.account_id,
      confidence: payments.length >= 3 ? 'moderate' : 'initial'
    });
  }
  recurring.sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.merchant.localeCompare(b.merchant));
  const dueCents = recurring.filter(entry => !entry.paidThisMonth && entry.nextDue.slice(0, 7) === month)
    .reduce((sum, entry) => sum + entry.estimatedCents, 0);
  return {
    month, incomeCents, expenseCents, netCents: incomeCents - expenseCents,
    estimatedDueCents: dueCents, importedThisMonth,
    excludedTransfers: internalTransfers.size,
    categories: [...spending].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
      .map(([name, amountCents]) => ({ name, amountCents })),
    recurring
  };
}
