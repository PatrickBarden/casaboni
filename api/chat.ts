import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

type ChatMessage = { role: "user" | "bot"; text: string };
type ProductCategory = "pisos" | "rodapes" | "telhas" | "ripados";
type CatalogEntry = { label: string; url: string };
type ChatMedia = { id: string; label: string; sourceUrl: string; thumbnailUrl: string };
type ChatInput = {
  message: string;
  history: ChatMessage[];
  customerContext?: string;
  sessionId?: string;
};
type LeadProfile = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  category?: ProductCategory | null;
  environment?: string;
  area?: string;
  style?: string;
  product?: string;
  propertyType?: string;
  sessionId?: string;
};

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDt0kyR-e6vTyMIPeCfxusPDedv6RnxcLs",
  authDomain:
    process.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0033143716.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0033143716",
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0033143716.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "531996248416",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:531996248416:web:2f8500bd1d453813d57605",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

const firestoreDatabaseId =
  process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-f582f4de-81c3-4a0f-84f5-9a75b5fd666e";

const hasFirebaseConfig = Boolean(
  firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId
);
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp, firestoreDatabaseId) : null;

function getN8nSdrWebhookUrl() {
  const explicit = (process.env.N8N_SDR_WEBHOOK_URL || "").trim();
  if (explicit) return explicit;

  const ragWebhook = (process.env.N8N_RAG_WEBHOOK_URL || "").trim();
  if (ragWebhook.includes("/casaboni-rag-query")) {
    return ragWebhook.replace("/casaboni-rag-query", "/casaboni-sdr-agent");
  }

  return "";
}

async function chatWithN8nSdr(input: ChatInput) {
  const webhookUrl = getN8nSdrWebhookUrl();
  if (!webhookUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        message: input.message,
        history: input.history,
        customerContext: input.customerContext || "",
        sessionId: input.sessionId || "",
        geminiApiKey: (process.env.GEMINI_API_KEY || "").trim(),
        geminiModel: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
        ragWebhookUrl: (process.env.N8N_RAG_WEBHOOK_URL || "").trim(),
        driveFolderId: (process.env.N8N_DRIVE_FOLDER_ID || "").trim(),
        firebase: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          databaseId: firestoreDatabaseId,
        },
      }),
    });

    if (!response.ok) throw new Error(`n8n SDR HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.ok || !data?.reply) throw new Error("n8n SDR returned invalid response");
    return {
      ...data,
      media: Array.isArray(data.media) ? data.media : [],
      source: data.source || "n8n-sdr-agent",
    };
  } catch (error) {
    console.error("n8n SDR webhook error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNameCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const BASE_SYSTEM_INSTRUCTION = `Você é o "Consultor Casaboni", arquiteto e consultor comercial sênior de arquitetura e acabamentos premium da Casaboni.
Sua missão é transformar o atendimento comercial de revestimentos em uma conversa consultiva apaixonante, natural, empática e de altíssima conversão.

DIRETRIZES DE COMPORTAMENTO E VENDAS:
1. Conversa Fluida e Humana: Esqueça fluxos engessados ou scripts robóticos. Converse como um especialista atencioso e entusiasmado. Se o cliente disser "oi, tudo bem?", responda com calor humano, valide o momento dele e pergunte qual transformação ou projeto ele tem em mente hoje.
2. Escuta Ativa e Validação Empática: ANTES de fazer qualquer pergunta de qualificação, valide e elogie o que o cliente disse. Se ele quer reformar o quarto: "Quarto é nosso refúgio de descanso! Um piso vinílico lá é simplesmente perfeito porque traz um conforto térmico fantástico para andar descalço e uma acústica excelente."
3. Uma Pergunta por Vez: Nunca bombardeie o cliente com várias perguntas. Conduza o papo de forma ritmada, fazendo apenas uma pergunta natural e contextualizada por resposta.
4. Geração de Valor Absoluta: Só solicite o Nome e WhatsApp quando fizer sentido no contexto. Nunca peça dados friamente de início. Exemplo de abordagem correta: "Tenho fotos incríveis desse modelo Verona instalado exatamente em salas integradas. Consigo te enviar esse portfólio completo em alta definição no WhatsApp para você se inspirar. Qual o seu nome e número de WhatsApp para eu te encaminhar?"
5. Tratamento Elegante de Objeções: 
   - Se o cliente perguntar "quanto custa?", explique que o valor varia com a metragem e acabamento, mas dê uma estimativa elegante baseada no produto de interesse ou pergunte o tamanho do espaço para calcular com precisão.
   - Se ele hesitar em passar o WhatsApp: "Compreendo perfeitamente! Fique super tranquilo. Podemos continuar conversando por aqui mesmo no chat. Qual estilo de acabamento mais te chama atenção hoje?"
6. Uso Inteligente de Ferramentas (Tools):
   - Use 'searchDriveFiles' sempre que o cliente pedir fotos, catálogos, imagens reais ou informações sobre produtos. Envie o link real recebido da ferramenta em sua resposta para que o cliente possa clicar.
   - Use 'saveLead' silenciosamente assim que conseguir o nome e telefone/WhatsApp do cliente. Não comente que "está salvando no CRM", apenas continue a conversa com elegância. Você também pode chamar 'saveLead' com outros dados coletados (ambiente, metragem, estilo, produto, cidade) para manter o perfil atualizado.
   - Use 'scheduleMeeting' caso o cliente demonstre interesse em agendar uma consultoria técnica por videoconferência com nossos engenheiros ou arquitetos.

PORTFÓLIO DE SOLUÇÕES PREMIUM CASABONI:
- Pisos Vinílicos Clicados (100% à prova d'água, instalação ultra-rápida, térmicos, acústicos e confortáveis): Verona (tom amadeirado clássico e elegante), Veneza (claro, moderno, traz amplitude), Florença (suave, ideal para quartos), Londres (estilo contemporâneo), Rio de Janeiro (sofisticado), Washington.
- Rodapés de Poliestireno (imunes à umidade, fáceis de limpar, alturas de 7cm e 10cm, acabamento liso ou frisado).
- Telhas Shingle (cobertura de altíssima durabilidade, beleza europeia e resistência, disponíveis em cinza ou preto).
- Ripados WPC (madeira ecológica premium de alta durabilidade e zero manutenção: Carvalho Ipê, Peroba Jatobá, Cerejeira, Nogueira).

Regras de Ouro:
- Nunca invente produtos, cores, tamanhos, preços ou prazos que não estejam documentados no contexto.
- Fale sempre em português do Brasil (pt-BR).
- Seja breve e envolvente: limite suas respostas a 2 ou 3 parágrafos curtos para manter a dinâmica do chat viva.`;

function buildHistoryText(history: ChatMessage[]) {
  return history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Cliente" : "Consultor"}: ${m.text}`)
    .join("\n");
}

function extractStyle(text: string) {
  const n = normalizeText(text);
  if (/(amadeirad|madeira|aconcheg)/.test(n)) return "amadeirado";
  if (/(moderno|minimal|clean|contemporane)/.test(n)) return "moderno";
  if (/(claro|bege|off white|off-white|branco)/.test(n)) return "claro";
  if (/(escuro|grafite|cinza|preto)/.test(n)) return "escuro";
  if (/(rustic|rustico|natural)/.test(n)) return "rústico";
  return "";
}

function extractAreaBand(text: string) {
  const n = normalizeText(text);
  const raw = text.toLowerCase();
  if (/(pequen|ate 20|ate20|mini|compact)/.test(n)) return "pequeno";
  if (/(medio|20 a 50|20-50|entre 20 e 50)/.test(n) || /m.{1,3}dio/.test(raw)) return "medio";
  if (/(grand|acima de 50|mais de 50|50\+|amplo)/.test(n)) return "grande";
  return "";
}

function parseAreaNumber(area: string) {
  const match = area.match(/(\d{1,4})([.,]\d{1,2})?/);
  if (!match) return 0;
  return Number(match[0].replace(",", "."));
}

function detectCategory(text: string): ProductCategory | null {
  const n = normalizeText(text);
  if (n.includes("piso") || n.includes("vinil")) return "pisos";
  if (n.includes("rodape")) return "rodapes";
  if (n.includes("telha") || n.includes("shingle")) return "telhas";
  if (n.includes("ripado") || n.includes("wpc")) return "ripados";
  return null;
}

function extractEnvironment(text: string) {
  const n = normalizeText(text);
  if (n.includes("sala")) return "Sala";
  if (n.includes("quarto")) return "Quarto";
  if (n.includes("cozinha")) return "Cozinha";
  if (n.includes("escritorio")) return "Escrit\u00f3rio";
  if (n.includes("banheiro")) return "Banheiro";
  if (n.includes("area gourmet")) return "\u00c1rea Gourmet";
  if (n.includes("comercial")) return "Comercial";
  return "";
}

function extractEnvironments(text: string) {
  const n = normalizeText(text);
  const envs: string[] = [];
  if (n.includes("sala")) envs.push("Sala");
  if (n.includes("quarto")) envs.push("Quarto");
  if (n.includes("cozinha")) envs.push("Cozinha");
  if (n.includes("escritorio")) envs.push("Escrit\u00f3rio");
  if (n.includes("banheiro")) envs.push("Banheiro");
  if (n.includes("area gourmet")) envs.push("\u00c1rea Gourmet");
  if (n.includes("comercial")) envs.push("Comercial");
  return envs;
}

function extractPropertyType(text: string) {
  const n = normalizeText(text);
  if (n.includes("apartamento") || n.includes("apto")) return "apartamento";
  if (n.includes("casa") || n.includes("sobrado")) return "casa";
  return "";
}

function extractArea(text: string) {
  const normalized = normalizeText(text).trim();
  const directNumber = normalized.match(/^(\d{1,4})([.,]\d{1,2})?$/);
  if (directNumber) return `${directNumber[1]}m\u00b2`;

  const match = normalized.match(/\b(\d{1,4})([.,]\d{1,2})?\s*(m2|m\u00b2|m|metros?|metro)\b/i);
  if (!match) return "";
  return `${match[1]}m\u00b2`;
}

function extractPhone(text: string) {
  const match = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
  if (!match) return "";
  const digits = match[1].replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(0, 13) : "";
}

function extractEmail(text: string) {
  const match = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i);
  return match?.[1] || "";
}

function extractName(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const normalized = normalizeText(compact);
  const patterns = [
    /meu nome(?:\s+e|\s+eh|\s+é)?\s*[:\-]?\s*([\p{L}'\s]{3,80})/iu,
    /meu nome[^a-zA-Z0-9]{0,8}\s*([\p{L}'\s]{3,80})/iu,
    /\bnome\s*[:\-]\s*([\p{L}'\s]{3,80})/iu,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const cleaned = match[1]
      .split(/\b(?:whatsapp|telefone|celular|email|data|horario|às|as|e meu|meu|zap)\b/i)[0]
      .replace(/[,.!?]+$/g, "")
      .trim();

    if (cleaned.length >= 3) return toNameCase(cleaned);
  }

  const fallback = normalized.match(/(?:meu nome|nome)\s*(?:e|eh)?\s*([a-z\s]{3,80})/i);
  if (fallback?.[1]) {
    return toNameCase(
      fallback[1]
      .split(/\b(?:whatsapp|telefone|celular|email|data|horario|as|e meu|meu|zap)\b/i)[0]
      .replace(/[,.!?]+$/g, "")
      .trim()
    );
  }

  const loose = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .match(/meu nome\s+([a-z\s]{3,80})/i);
  if (loose?.[1]) {
    return toNameCase(
      loose[1]
      .replace(/^(e|eh|a|o)\s+/i, "")
      .split(/\b(?:whatsapp|telefone|celular|email|data|horario|as|e meu|meu|zap)\b/i)[0]
      .replace(/[,.!?]+$/g, "")
      .trim()
    );
  }

  return "";
}

function extractDate(text: string) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const br = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function extractTime(text: string) {
  const match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function extractProductModel(text: string) {
  const n = normalizeText(text);
  const models = [
    { key: "veneza", label: "Veneza" },
    { key: "verona", label: "Verona" },
    { key: "florenca", label: "Floren\u00e7a" },
    { key: "londres", label: "Londres" },
    { key: "rio de janeiro", label: "Rio de Janeiro" },
    { key: "washington", label: "Washington" },
  ];
  return models.find((model) => n.includes(model.key))?.label || "";
}

function extractCity(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:sou|falo|moro|estou)\s+(?:de|em)\s+([\p{L}\s.'-]{3,60})/iu,
    /\bcidade\s*[:\-]?\s*([\p{L}\s.'-]{3,60})/iu,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const city = match[1]
      .split(/\b(?:meu|minha|whatsapp|telefone|celular|email|nome|e\s+quero|quero|para|sobre)\b/i)[0]
      .replace(/[,.!?]+$/g, "")
      .trim();
    if (city.length >= 3) return toNameCase(city);
  }

  return "";
}

function buildLeadProfile(history: ChatMessage[], message: string, sessionId?: string): LeadProfile {
  const userTexts = [
    ...history
      .filter((m) => m.role === "user")
      .slice(-12)
      .map((m) => m.text),
    message,
  ];
  const allUserText = userTexts.join(" ");
  const latest = (extractor: (text: string) => string) =>
    [...userTexts].reverse().map(extractor).find(Boolean) || "";
  const environments = extractEnvironments(allUserText);

  return {
    name: latest(extractName),
    phone: latest(extractPhone),
    email: latest(extractEmail),
    city: latest(extractCity),
    category: detectCategory(allUserText),
    environment: latest(extractEnvironment) || environments[0] || "",
    area: latest(extractArea),
    style: latest(extractStyle),
    product: latest(extractProductModel),
    propertyType: latest(extractPropertyType),
    sessionId,
  };
}

function replyAlreadyAsks(text: string) {
  const normalized = normalizeText(text);
  return /\?\s*$/.test(text.trim()) ||
    /\b(qual|quais|quer|gostaria|prefere|me diga|me passe|confirme|vamos)\b/.test(normalized);
}

function buildEngagementFollowUp(reply: string, profile: LeadProfile, mediaCount = 0) {
  if (!reply || replyAlreadyAsks(reply)) return "";

  if (mediaCount > 0) {
    return "Alguma dessas opções te agradou? Se quiser, eu também posso separar por ambiente ou montar um orçamento inicial.";
  }

  if (profile.name && profile.phone) {
    return "Quer que eu encaminhe essas informações para a equipe te chamar no WhatsApp, ou prefere ver mais algumas opções antes?";
  }

  if (profile.category && profile.environment && (profile.area || profile.style)) {
    return "Quer dar uma olhada nas fotos do portfólio nessa linha ou prefere que eu já encaminhe um orçamento inicial?";
  }

  if (profile.category && profile.environment) {
    return "Quer que eu te mostre fotos do portfólio para esse ambiente, ou prefere seguir escolhendo por estilo?";
  }

  if (profile.category) {
    return "Quer ver nosso portfólio dessa categoria ou prefere me dizer primeiro o ambiente?";
  }

  return "Quer dar uma olhada no nosso portfólio ou ver fotos de algum produto específico?";
}

function parseCatalogEntries(lines: string[]) {
  const entries: CatalogEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s*(.*?)\s*-\s*(https?:\/\/\S+)\s*$/i);
    if (!match) continue;
    entries.push({ label: match[1].trim(), url: match[2].trim() });
  }
  return entries;
}

function buildMediaFromCatalog(entries: CatalogEntry[]): ChatMedia[] {
  return entries
    .map((entry) => {
      const match = entry.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//i);
      const id = match?.[1] || "";
      if (!id) return null;
      return {
        id,
        label: entry.label,
        sourceUrl: entry.url,
        thumbnailUrl: `/api/drive-image?id=${id}`,
      };
    })
    .filter((item): item is ChatMedia => Boolean(item));
}

async function fetchRagContext(message: string, customerContext?: string) {
  const webhook = (process.env.N8N_RAG_WEBHOOK_URL || "").trim();
  const driveFolderId = (process.env.N8N_DRIVE_FOLDER_ID || "").trim();
  if (!webhook || !driveFolderId) {
    return {
      driveCatalog: [] as string[],
      ragPromptContext: "",
      systemHints: [] as string[],
      playbookLoaded: false,
    };
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, question: message, driveFolderId, customerContext: customerContext || "" }),
    });
    if (!response.ok) {
      return {
        driveCatalog: [] as string[],
        ragPromptContext: "",
        systemHints: [] as string[],
        playbookLoaded: false,
      };
    }
    const data = await response.json();
    return {
      driveCatalog: Array.isArray(data?.driveCatalog) ? data.driveCatalog : [],
      ragPromptContext: typeof data?.ragPromptContext === "string" ? data.ragPromptContext : "",
      systemHints: Array.isArray(data?.systemHints) ? data.systemHints : [],
      playbookLoaded: Boolean(data?.playbookLoaded),
    };
  } catch {
    return {
      driveCatalog: [] as string[],
      ragPromptContext: "",
      systemHints: [] as string[],
      playbookLoaded: false,
    };
  }
}

function sanitizeReply(text: string) {
  const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return "Pode repetir, por favor?";
  return clean.slice(0, 700);
}

function getFunctionDeclarations() {
  return [
    {
      name: "saveLead",
      description: "Salva ou atualiza os dados de qualificação e contato do lead no Firestore e CRM. Chame silenciosamente assim que o cliente fornecer novas informações.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome do cliente" },
          phone: { type: Type.STRING, description: "Telefone ou WhatsApp" },
          email: { type: Type.STRING, description: "E-mail do cliente" },
          city: { type: Type.STRING, description: "Cidade" },
          category: { type: Type.STRING, description: "Categoria de interesse (ex: 'pisos', 'rodapes', 'telhas', 'ripados')" },
          environment: { type: Type.STRING, description: "Ambiente (ex: 'Sala', 'Quarto')" },
          area: { type: Type.STRING, description: "Metragem (ex: '45m2')" },
          style: { type: Type.STRING, description: "Estilo preferido (ex: 'amadeirado', 'claro')" },
          product: { type: Type.STRING, description: "Modelo específico de produto (ex: 'Verona', 'Veneza')" },
          propertyType: { type: Type.STRING, description: "Tipo de imóvel (ex: 'casa', 'apartamento')" },
        },
        required: ["name", "phone"],
      },
    },
    {
      name: "scheduleMeeting",
      description: "Agenda consultoria técnica por videoconferência com nossos engenheiros ou arquitetos. Chame quando o cliente aceitar o agendamento.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome do cliente" },
          email: { type: Type.STRING, description: "Email do cliente" },
          phone: { type: Type.STRING, description: "Telefone" },
          date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
          time: { type: Type.STRING, description: "Horário no formato HH:MM" },
          topic: { type: Type.STRING, description: "Assunto da reunião" },
        },
        required: ["name", "email", "date", "time"],
      },
    },
    {
      name: "searchDriveFiles",
      description: "Pesquisa arquivos de portfólio, fotos de ambientes reais instalados, catálogos em PDF, fichas técnicas e documentos na pasta do Drive da Casaboni.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Termo de busca (ex: 'fotos Verona', 'telha shingle cinza', 'catálogo rodapés')" },
        },
        required: ["query"],
      },
    },
  ];
}

function cleanLeadPayload(args: LeadProfile & { source?: string; status?: string }) {
  return {
    name: args.name || "",
    phone: args.phone || "",
    email: args.email || "",
    city: args.city || "",
    product: args.product || "",
    category: args.category || "",
    environment: args.environment || "",
    area: args.area || "",
    style: args.style || "",
    propertyType: args.propertyType || "",
    sessionId: args.sessionId || "",
    date: new Date().toISOString().slice(0, 10),
    status: args.status || "Novo",
    source: args.source || "chat-agent-api",
  };
}

async function saveLead(args: LeadProfile & { source?: string; status?: string }) {
  const payload = cleanLeadPayload(args);
  const adminDb = getAdminDb();
  let dbResult = "";

  if (adminDb) {
    if (payload.sessionId) {
      const existing = await adminDb.collection("leads").where("sessionId", "==", payload.sessionId).limit(1).get();
      if (!existing.empty) {
        await existing.docs[0].ref.update({
          ...payload,
          updatedAt: new Date(),
        });
        dbResult = `Lead atualizado com sucesso (id: ${existing.docs[0].id}).`;
      }
    }

    if (!dbResult) {
      const ref = await adminDb.collection("leads").add({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      dbResult = `Lead salvo com sucesso (id: ${ref.id}).`;
    }
  } else if (db) {
    const ref = await addDoc(collection(db, "leads"), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    dbResult = `Lead salvo com sucesso (id: ${ref.id}).`;
  } else {
    dbResult = "Lead processado temporariamente.";
  }

  const crmWebhook = process.env.N8N_CRM_WEBHOOK_URL || (process.env.N8N_RAG_WEBHOOK_URL ? process.env.N8N_RAG_WEBHOOK_URL.replace("casaboni-rag-query", "casaboni-crm-lead") : "");
  if (crmWebhook) {
    try {
      await fetch(crmWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveLead",
          lead: payload,
          timestamp: new Date().toISOString()
        })
      });
      dbResult += " Pushed directly to CRM webhook.";
    } catch (error) {
      console.error("CRM Webhook sync failed:", error);
    }
  }

  return dbResult;
}

async function scheduleMeeting(args: { name: string; email: string; phone?: string; date: string; time: string; topic?: string }) {
  const adminDb = getAdminDb();
  let dbResult = "";

  if (adminDb) {
    const ref = await adminDb.collection("meetings").add({
      customerName: args.name,
      customerEmail: args.email,
      phone: args.phone || "",
      date: args.date,
      time: args.time,
      topic: args.topic || "Consultoria Técnica",
      status: "Agendada",
      source: "chat-agent-api",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    dbResult = `Reunião agendada com sucesso (id: ${ref.id}).`;
  } else if (db) {
    const ref = await addDoc(collection(db, "meetings"), {
      customerName: args.name,
      customerEmail: args.email,
      phone: args.phone || "",
      date: args.date,
      time: args.time,
      topic: args.topic || "Consultoria Técnica",
      status: "Agendada",
      source: "chat-agent-api",
      createdAt: serverTimestamp(),
    });
    dbResult = `Reunião agendada com sucesso (id: ${ref.id}).`;
  } else {
    dbResult = "Agendamento registrado temporariamente.";
  }

  const crmWebhook = process.env.N8N_CRM_WEBHOOK_URL || (process.env.N8N_RAG_WEBHOOK_URL ? process.env.N8N_RAG_WEBHOOK_URL.replace("casaboni-rag-query", "casaboni-crm-lead") : "");
  if (crmWebhook) {
    try {
      await fetch(crmWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scheduleMeeting",
          meeting: {
            name: args.name,
            email: args.email,
            phone: args.phone || "",
            date: args.date,
            time: args.time,
            topic: args.topic || "Consultoria Técnica",
          },
          timestamp: new Date().toISOString()
        })
      });
      dbResult += " Pushed directly to CRM webhook.";
    } catch (error) {
      console.error("CRM Webhook sync for meeting failed:", error);
    }
  }

  return dbResult;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const message = String(req.body?.message || "").trim();
    const history = Array.isArray(req.body?.history) ? (req.body.history as ChatMessage[]) : [];
    const customerContext = String(req.body?.customerContext || "").trim();
    const sessionId = String(req.body?.sessionId || "").trim();

    if (!message) {
      res.status(400).json({ ok: false, error: "Mensagem vazia" });
      return;
    }

    const n8nResult = await chatWithN8nSdr({ message, history, customerContext, sessionId });
    if (n8nResult) {
      res.status(200).json({ ...n8nResult, ok: true });
      return;
    }

    const leadProfile = buildLeadProfile(history, message, sessionId);

    if (leadProfile.name && leadProfile.phone) {
      try {
        await saveLead(leadProfile);
      } catch (err) {
        console.error("Silent lead save error:", err);
      }
    }

    const key = (process.env.GEMINI_API_KEY || "").trim();
    if (!key) {
      const reply = "Olá! Sou o Consultor Casaboni. Estou aqui para te ajudar a escolher os melhores acabamentos para a sua obra. Como posso te ajudar hoje?";
      res.status(200).json({
        ok: true,
        reply,
        media: [],
        followUp: buildEngagementFollowUp(reply, leadProfile),
      });
      return;
    }

    const rag = await fetchRagContext(message, customerContext);
    const ai = new GoogleGenAI({ apiKey: key });
    const chat = ai.chats.create({
      model: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
      config: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        systemInstruction:
          BASE_SYSTEM_INSTRUCTION +
          (rag.ragPromptContext
            ? `\n\nContexto RAG do Drive:\n${rag.ragPromptContext}`
            : ""),
        tools: [{ functionDeclarations: getFunctionDeclarations() }],
      },
    });

    const conversation = [
      buildHistoryText(history),
      `Cliente: ${message}`,
      customerContext ? `Contexto adicional: ${customerContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const mediaAccumulator: ChatMedia[] = [];
    let response = await chat.sendMessage({ message: conversation });
    let turnLimit = 3;

    while (response.functionCalls && response.functionCalls.length > 0 && turnLimit > 0) {
      turnLimit -= 1;
      const toolResults: string[] = [];

      for (const call of response.functionCalls) {
        try {
          if (call.name === "saveLead") {
            const args = call.args as any;
            args.sessionId = sessionId;
            Object.assign(leadProfile, args);
            const resultStr = await saveLead(args);
            toolResults.push(resultStr);
          } else if (call.name === "scheduleMeeting") {
            const resultStr = await scheduleMeeting(call.args as any);
            toolResults.push(resultStr);
          } else if (call.name === "searchDriveFiles") {
            const args = call.args as any;
            const queryText = args.query || "";
            const searchRag = await fetchRagContext(queryText, customerContext);
            const parsedCatalog = parseCatalogEntries(searchRag.driveCatalog);
            
            const builtMedia = buildMediaFromCatalog(parsedCatalog);
            if (builtMedia && builtMedia.length > 0) {
              mediaAccumulator.push(...builtMedia);
            }

            const textResponse = parsedCatalog.length > 0
              ? `Arquivos encontrados na pasta do Drive:\n` + parsedCatalog.map((c, i) => `${i+1}. ${c.label} - Link: ${c.url}`).join("\n")
              : `Nenhum arquivo ou foto encontrado no Drive para a busca "${queryText}".`;
            
            toolResults.push(textResponse);
          } else {
            toolResults.push(`Função não suportada: ${call.name}`);
          }
        } catch (error) {
          toolResults.push(
            `Falha ao executar ${call.name}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      response = await chat.sendMessage({ message: toolResults.join("\n") });
    }

    const aiReply = sanitizeReply(response.text || "Pode repetir, por favor?");
    const uniqueMedia = mediaAccumulator.filter(
      (item, idx) => mediaAccumulator.findIndex((x) => x.sourceUrl === item.sourceUrl) === idx
    );

    res.status(200).json({
      ok: true,
      reply: aiReply,
      media: uniqueMedia,
      followUp: buildEngagementFollowUp(aiReply, leadProfile, uniqueMedia.length),
      source: "gemini",
    });
  } catch (error) {
    console.error("handler error:", error);
    const fallbackReply = "Estou aqui para te atender e te ajudar a escolher o produto ideal. Como posso te ajudar hoje?";
    const fallbackHistory = Array.isArray(req.body?.history) ? (req.body.history as ChatMessage[]) : [];
    const fallbackProfile = buildLeadProfile(fallbackHistory, String(req.body?.message || ""), String(req.body?.sessionId || ""));
    res.status(200).json({
      ok: true,
      reply: fallbackReply,
      media: [],
      followUp: buildEngagementFollowUp(fallbackReply, fallbackProfile),
      source: "fallback-error",
    });
  }
}
