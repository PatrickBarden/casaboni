const body = $json.body || $json || {};
const message = String(body.message || body.question || '').trim();
const history = Array.isArray(body.history) ? body.history : [];
const customerContext = String(body.customerContext || '').trim();
const sessionId = String(body.sessionId || '').trim();
const model = String(body.geminiModel || 'gemini-2.5-flash').trim();
const geminiApiKey = String(body.geminiApiKey || '').trim();
const ragWebhookUrl = String(body.ragWebhookUrl || '').trim();
const driveFolderId = String(body.driveFolderId || '').trim();
const firebase = body.firebase || {};

function normalizeText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function toNameCase(value) {
  return String(value || '').toLowerCase().split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
function extractPhone(text) {
  const match = String(text || '').match(/(\+?\d[\d\s().-]{8,}\d)/);
  if (!match) return '';
  const digits = match[1].replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(0, 13) : '';
}
function extractEmail(text) {
  const match = String(text || '').match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i);
  return match?.[1] || '';
}
function extractName(text) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeText(compact);
  const direct = compact.match(/(?:meu nome|nome)\s*(?:é|e|eh|\?|:|-)?\s*([A-Za-zÀ-ÿ' ]{3,80})/i);
  if (direct?.[1]) {
    const cleaned = direct[1]
      .split(/\b(?:e meu|whatsapp|telefone|celular|email|cidade|data|horario|às|as|meu|zap)\b/i)[0]
      .replace(/[,.!?]+$/g, '')
      .trim();
    if (cleaned.length >= 3) return toNameCase(cleaned);
  }
  const patterns = [
    /meu nome(?:\s+e|\s+eh|\s+é)?\s*[:\-]?\s*([\p{L}'\s]{3,80})/iu,
    /\bnome\s*[:\-]\s*([\p{L}'\s]{3,80})/iu,
    /sou\s+(?:o|a)?\s*([\p{L}'\s]{3,50})/iu,
  ];
  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const cleaned = match[1].split(/\b(?:whatsapp|telefone|celular|email|cidade|data|horario|às|as|e meu|meu|zap)\b/i)[0].replace(/[,.!?]+$/g, '').trim();
    if (cleaned.length >= 3) return toNameCase(cleaned);
  }

  const fallback = normalized.match(/(?:meu nome|nome)\s*(?:e|eh|\?)?\s*([a-z\s]{3,80})/i);
  if (fallback?.[1]) {
    const cleaned = fallback[1]
      .split(/\b(?:whatsapp|telefone|celular|email|cidade|data|horario|as|e meu|meu|zap)\b/i)[0]
      .replace(/[,.!?]+$/g, '')
      .trim();
    if (cleaned.length >= 3) return toNameCase(cleaned);
  }

  return '';
}
function extractArea(text) {
  const normalized = normalizeText(text).trim();
  const directNumber = normalized.match(/^(\d{1,4})([.,]\d{1,2})?$/);
  if (directNumber) return directNumber[1] + 'm²';
  const match = normalized.match(/\b(\d{1,4})([.,]\d{1,2})?\s*(m2|m²|m|metros?|metro)\b/i);
  return match ? match[1] + 'm²' : '';
}
function detectCategory(text) {
  const n = normalizeText(text);
  if (n.includes('piso') || n.includes('vinil')) return 'pisos';
  if (n.includes('rodape')) return 'rodapes';
  if (n.includes('telha') || n.includes('shingle')) return 'telhas';
  if (n.includes('ripado') || n.includes('wpc')) return 'ripados';
  return '';
}
function extractEnvironment(text) {
  const n = normalizeText(text);
  if (n.includes('sala')) return 'Sala';
  if (n.includes('quarto')) return 'Quarto';
  if (n.includes('cozinha')) return 'Cozinha';
  if (n.includes('escritorio')) return 'Escritório';
  if (n.includes('banheiro')) return 'Banheiro';
  if (n.includes('area gourmet')) return 'Área Gourmet';
  if (n.includes('comercial')) return 'Comercial';
  return '';
}
function extractStyle(text) {
  const n = normalizeText(text);
  if (/(amadeirad|madeira|aconcheg)/.test(n)) return 'amadeirado';
  if (/(moderno|minimal|clean|contemporane)/.test(n)) return 'moderno';
  if (/(claro|bege|off white|off-white|branco)/.test(n)) return 'claro';
  if (/(escuro|grafite|cinza|preto)/.test(n)) return 'escuro';
  if (/(rustic|rustico|natural)/.test(n)) return 'rústico';
  return '';
}
function extractProductModel(text) {
  const n = normalizeText(text);
  const models = [
    ['veneza', 'Veneza'], ['verona', 'Verona'], ['florenca', 'Florença'],
    ['londres', 'Londres'], ['rio de janeiro', 'Rio de Janeiro'], ['washington', 'Washington']
  ];
  return (models.find(([key]) => n.includes(key)) || [null, ''])[1];
}
function extractCity(text) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  const patterns = [/\b(?:sou|falo|moro|estou)\s+(?:de|em)\s+([\p{L}\s.'-]{3,60})/iu, /\bcidade\s*[:\-]?\s*([\p{L}\s.'-]{3,60})/iu];
  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const city = match[1].split(/\b(?:meu|minha|whatsapp|telefone|celular|email|nome|e\s+quero|quero|para|sobre)\b/i)[0].replace(/[,.!?]+$/g, '').trim();
    if (city.length >= 3) return toNameCase(city);
  }
  return '';
}
function latest(texts, extractor) {
  return [...texts].reverse().map(extractor).find(Boolean) || '';
}
function buildLeadProfile(history, message, sessionId) {
  const userTexts = [...history.filter(m => m.role === 'user').slice(-12).map(m => m.text), message];
  const all = userTexts.join(' ');
  return {
    name: latest(userTexts, extractName), phone: latest(userTexts, extractPhone), email: latest(userTexts, extractEmail), city: latest(userTexts, extractCity),
    category: detectCategory(all), environment: latest(userTexts, extractEnvironment), area: latest(userTexts, extractArea), style: latest(userTexts, extractStyle),
    product: latest(userTexts, extractProductModel), sessionId,
  };
}
function parseCatalogEntries(lines) {
  return (Array.isArray(lines) ? lines : []).map(line => {
    const match = String(line).match(/^\s*\d+\.\s*(.*?)\s*-\s*(https?:\/\/\S+)\s*$/i);
    return match ? { label: match[1].trim(), url: match[2].trim() } : null;
  }).filter(Boolean);
}
function isMediaIntent(text) {
  const n = normalizeText(text);
  return /foto|imagem|catalogo|portfolio|portifolio|pdf|ver|mostrar|folhear|opcoes|inspira/.test(n);
}
function selectCatalog(catalog, message, profile) {
  const n = normalizeText([message, profile.category, profile.product, profile.style].filter(Boolean).join(' '));
  const models = ['veneza', 'verona', 'florenca', 'londres', 'rio de janeiro', 'washington'];
  let selected = [];
  const wantedModel = models.find(m => n.includes(m));
  if (wantedModel) selected = catalog.filter(c => normalizeText(c.label).includes(wantedModel));
  if (!selected.length && profile.category === 'pisos') selected = catalog.filter(c => models.some(m => normalizeText(c.label).includes(m)));
  if (!selected.length && profile.category === 'rodapes') selected = catalog.filter(c => normalizeText(c.label).includes('rodape'));
  if (!selected.length && profile.category === 'telhas') selected = catalog.filter(c => /telha|shingle|portfolio/.test(normalizeText(c.label)));
  if (!selected.length && profile.category === 'ripados') selected = catalog.filter(c => /ripado|wpc|portfolio/.test(normalizeText(c.label)));
  if (!selected.length && isMediaIntent(message)) selected = catalog.filter(c => /veneza|verona|florenca|londres|rio de janeiro|washington|rodape|portfolio/.test(normalizeText(c.label)));
  return selected.filter((item, idx) => selected.findIndex(x => x.url === item.url) === idx).slice(0, 4);
}
function buildMedia(entries) {
  return entries.map(entry => {
    const id = entry.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//i)?.[1] || '';
    if (!id) return null;
    return { id, label: entry.label, sourceUrl: entry.url, thumbnailUrl: '/api/drive-image?id=' + id };
  }).filter(Boolean);
}
function cleanReply(text) {
  return String(text || '').replace(/https?:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/view[^\s)]*/gi, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 900);
}
function asks(text) {
  const n = normalizeText(text);
  return /\?\s*$/.test(String(text).trim()) || /\b(qual|quais|quer|gostaria|prefere|me conta|me diga|posso|vamos)\b/.test(n);
}
function followUp(reply, profile, mediaCount) {
  if (!reply || asks(reply)) return '';
  if (mediaCount > 0) return 'Alguma dessas opções combina com o que você imaginou? Se quiser, eu também posso separar por ambiente ou montar um orçamento inicial.';
  if (profile.name && profile.phone) return 'Quer que eu encaminhe essas informações para a equipe te chamar no WhatsApp, ou prefere ver mais algumas opções antes?';
  if (profile.category || profile.environment) return 'Quer dar uma olhada em fotos do portfólio ou prefere que eu te ajude a comparar estilos primeiro?';
  return 'Quer me contar qual ambiente você pretende transformar primeiro?';
}
async function fetchRag(query) {
  if (!ragWebhookUrl) return { driveCatalog: [], ragPromptContext: '', systemHints: [] };
  try {
    return await this.helpers.httpRequest({ method: 'POST', url: ragWebhookUrl, headers: { 'Content-Type': 'application/json' }, body: { message: query, question: query, driveFolderId, customerContext }, json: true });
  } catch (error) {
    return { driveCatalog: [], ragPromptContext: '', systemHints: [], ragError: String(error?.message || error) };
  }
}
async function saveLeadToFirestore(profile) {
  if (!profile.name || !profile.phone || !firebase?.apiKey || !firebase?.projectId || !firebase?.databaseId) return false;
  try {
    const fields = Object.fromEntries(Object.entries({
      name: profile.name || '', phone: profile.phone || '', email: profile.email || '', city: profile.city || '', category: profile.category || '', environment: profile.environment || '', area: profile.area || '', style: profile.style || '', product: profile.product || '', sessionId: profile.sessionId || '', status: 'Novo', source: 'n8n-sdr-agent', date: new Date().toISOString().slice(0, 10),
    }).map(([k, v]) => [k, { stringValue: String(v || '') }]));
    const url = 'https://firestore.googleapis.com/v1/projects/' + firebase.projectId + '/databases/' + firebase.databaseId + '/documents/leads?key=' + encodeURIComponent(firebase.apiKey);
    await this.helpers.httpRequest({ method: 'POST', url, headers: { 'Content-Type': 'application/json' }, body: { fields }, json: true });
    return true;
  } catch { return false; }
}

if (!message) return [{ json: { ok: false, reply: 'Mensagem vazia.', media: [], source: 'n8n-sdr-agent' } }];
const profile = buildLeadProfile(history, message, sessionId);
const rag = await fetchRag(message);
const catalog = parseCatalogEntries(rag.driveCatalog);
const selected = selectCatalog(catalog, message, profile);
const media = isMediaIntent(message) ? buildMedia(selected) : [];
const leadSaved = await saveLeadToFirestore(profile);
const thinkingBudget = model.includes('2.5-pro') ? 128 : (model.includes('2.5-flash') ? 0 : undefined);

if (!geminiApiKey) {
  const reply = 'Olá! Sou o Consultor Casaboni. Estou aqui para te atender e te ajudar a escolher o melhor acabamento para o seu ambiente. Qual espaço você quer transformar hoje?';
  return [{ json: { ok: true, reply, followUp: followUp(reply, profile, media.length), media, leadSaved, leadProfile: profile, source: 'n8n-sdr-agent-no-key' } }];
}

const conversation = history.slice(-10).map(m => (m.role === 'user' ? 'Cliente' : 'Consultor') + ': ' + m.text).concat('Cliente: ' + message).join('\n');
const catalogText = selected.length ? selected.map((c, i) => (i + 1) + '. ' + c.label).join('\n') : catalog.slice(0, 12).map((c, i) => (i + 1) + '. ' + c.label).join('\n');
const systemPrompt = 'Você é o Consultor Casaboni, um SDR humano, consultivo e comercial de primeiro atendimento.\n\n' +
'Objetivo: acolher, entender necessidade, educar, conduzir com leveza e converter o contato em próximo passo comercial sem parecer robótico.\n\n' +
'Regras obrigatórias:\n' +
'- Responda sempre em pt-BR natural, cordial e premium.\n' +
'- Nunca faça várias perguntas ao mesmo tempo; faça no máximo 1 pergunta principal por resposta.\n' +
'- Antes de perguntar, valide o que o cliente disse.\n' +
'- Não force venda nem orçamento cedo demais.\n' +
'- Se o cliente estiver indeciso, normalize a dúvida e ofereça inspiração/portfólio.\n' +
'- Se o cliente pedir fotos, diga que separou algumas opções e NÃO escreva links do Drive no texto; o sistema renderiza as imagens separadamente.\n' +
'- Se não souber preço, explique que depende de metragem, linha e acabamento, e peça o dado mínimo para estimar.\n' +
'- Produtos Casaboni: pisos vinílicos clicados, rodapés de poliestireno, telhas shingle e ripados WPC.\n' +
'- Linhas de piso: Veneza, Verona, Florença, Londres, Rio de Janeiro e Washington.\n' +
'- Capture nome, WhatsApp, cidade, ambiente, metragem e estilo de forma sutil ao longo da conversa.\n\n' +
'Contexto RAG/Drive:\n' + String(rag.ragPromptContext || '').slice(0, 2500) + '\n\n' +
'Arquivos relevantes disponíveis:\n' + (catalogText || 'Nenhum arquivo específico encontrado nesta consulta.') + '\n\n' +
'Perfil inferido até agora:\n' + JSON.stringify(profile) + '\n\n' +
'Retorne SOMENTE JSON válido com este formato: {"reply":"resposta curta e natural","followUp":"pergunta extra opcional para manter conversa viva ou vazio"}';

try {
  const data = await this.helpers.httpRequest({
    method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(geminiApiKey), headers: { 'Content-Type': 'application/json' }, json: true, body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: conversation }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {})
      }
    }
  });
  const geminiResponse = typeof data === 'string' ? JSON.parse(data) : data;
  const rawText = geminiResponse?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let parsed;
  try { parsed = JSON.parse(rawText); } catch { parsed = { reply: rawText, followUp: '' }; }
  const reply = cleanReply(parsed.reply || 'Posso te ajudar com pisos, rodapés, telhas e ripados. Qual ambiente você quer transformar?');
  const extra = cleanReply(parsed.followUp || followUp(reply, profile, media.length));
  const debug = body.debug ? {
    receivedMessage: message,
    messageCodes: Array.from(message.slice(0, 30)).map((char) => char.charCodeAt(0)),
    rawText: rawText.slice(0, 600),
    responseKeys: Object.keys(geminiResponse || {}),
    promptFeedback: geminiResponse?.promptFeedback,
    finishReason: geminiResponse?.candidates?.[0]?.finishReason || ''
  } : undefined;
  return [{ json: { ok: true, reply, followUp: extra, media, leadSaved, leadProfile: profile, rag: { filesFound: catalog.length, mediaSelected: media.length }, source: 'n8n-sdr-agent', ...(debug ? { debug } : {}) } }];
} catch (error) {
  const reply = media.length ? 'Separei algumas opções visuais para você ver com calma. Me diga qual delas combina mais com o ambiente que você imaginou.' : 'Estou aqui para te atender e te ajudar a escolher o produto ideal. Qual ambiente você quer transformar primeiro?';
  return [{ json: { ok: true, reply, followUp: followUp(reply, profile, media.length), media, leadSaved, leadProfile: profile, error: String(error?.message || error), source: 'n8n-sdr-agent-fallback' } }];
}

