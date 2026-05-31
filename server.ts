import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";
import { getAdminDb } from "./api/_firebaseAdmin.js";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ChatRole = "user" | "bot";
export interface ChatMessage {
  role: ChatRole;
  text: string;
}

type CatalogEntry = {
  label: string;
  url: string;
};

type ChatMedia = {
  id: string;
  label: string;
  sourceUrl: string;
  thumbnailUrl: string;
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

function isPhotoIntent(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("foto") ||
    normalized.includes("fotos") ||
    normalized.includes("imagem") ||
    normalized.includes("imagens") ||
    normalized.includes("catalogo") ||
    normalized.includes("portifolio") ||
    normalized.includes("portfolio")
  );
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

function parseCatalogEntries(lines: string[]): CatalogEntry[] {
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

export function isValidDriveFileId(id: string) {
  return /^[a-zA-Z0-9_-]{10,}$/.test(id);
}

export async function fetchDriveImage(id: string, mode: "auto" | "thumb" = "auto") {
  const urls =
    mode === "thumb"
      ? [`https://drive.google.com/thumbnail?id=${id}&sz=w1200`]
      : [
          `https://drive.usercontent.google.com/download?id=${id}&export=view`,
          `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
        ];

  for (const url of urls) {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 Casaboni/1.0",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.startsWith("image/")) {
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType };
    }
  }

  return null;
}

function hasCategoryMention(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("piso") ||
    normalized.includes("vinil") ||
    normalized.includes("rodape") ||
    normalized.includes("telha") ||
    normalized.includes("shingle") ||
    normalized.includes("ripado") ||
    normalized.includes("wpc") ||
    normalized.includes("veneza") ||
    normalized.includes("verona") ||
    normalized.includes("florenca") ||
    normalized.includes("londres") ||
    normalized.includes("rio de janeiro") ||
    normalized.includes("washington")
  );
}

function isPhotoFollowUpSelection(history: ChatMessage[], message: string) {
  if (hasPositiveChoiceIntent(message) || hasQuoteIntent(message)) return false;
  const hasCategory = hasCategoryMention(message);
  if (!hasCategory || history.length === 0) return false;

  const recentBotText = history
    .filter((h) => h.role === "bot")
    .slice(-4)
    .map((h) => h.text)
    .join(" ");
  const recentUserText = history
    .filter((h) => h.role === "user")
    .slice(-4)
    .map((h) => h.text)
    .join(" ");
  const normalizedBot = normalizeText(recentBotText);

  const botAskedForPhotoCategory =
    normalizedBot.includes("qual produto voce quer ver primeiro") ||
    normalizedBot.includes("tenho fotos de pisos") ||
    normalizedBot.includes("separo por categoria");

  // The frontend can submit the next message before React state includes the last bot reply.
  // In that case, the previous user photo request is the safest signal to keep the photo flow.
  return botAskedForPhotoCategory || isPhotoIntent(recentUserText);
}

function pickCatalogByIntent(message: string, catalog: CatalogEntry[]) {
  const normalized = normalizeText(message);
  const wantsPortfolio = /portfolio|portifolio|catalogo|inspiracao|inspirar/.test(normalized);
  const askClarification = {
    mode: "clarify" as const,
    reply:
      "Tenho fotos de pisos, rodapés, telhas shingle e ripados. Qual produto você quer ver primeiro?",
  };

  if (!catalog.length) {
    return {
      mode: "empty" as const,
      reply:
        "Ainda não encontrei imagens no catálogo do Drive. Posso te enviar o portfólio geral enquanto isso?",
    };
  }

  const models = ["veneza", "verona", "florenca", "londres", "rio de janeiro", "washington"];
  const matchedModel = models.find((m) => normalized.includes(m));
  if (matchedModel) {
    const selected = catalog.filter((c) => normalizeText(c.label).includes(matchedModel));
    return selected.length
      ? { mode: "selected" as const, selected, intro: `Perfeito! Separei as fotos da linha ${matchedModel}.` }
      : {
          mode: "none" as const,
          reply: `Não encontrei foto da linha ${matchedModel} no Drive agora. Posso te mandar as linhas mais próximas disponíveis?`,
        };
  }

  const wantsPisos = normalized.includes("piso") || normalized.includes("vinil");
  const wantsRodape = normalized.includes("rodape");
  const wantsTelha = normalized.includes("telha") || normalized.includes("shingle");
  const wantsRipado = normalized.includes("ripado") || normalized.includes("wpc");

  const hasAnyCategory = wantsPisos || wantsRodape || wantsTelha || wantsRipado;
  if (!hasAnyCategory) {
    if (wantsPortfolio) {
      const selected = catalog
        .filter((item) => {
          const label = normalizeText(item.label);
          return models.some((m) => label.includes(m)) || label.includes("rodape");
        })
        .slice(0, 6);

      return selected.length
        ? {
            mode: "selected" as const,
            selected,
            intro:
              "Claro. Separei um recorte visual do portfólio para você folhear primeiro. Depois me diga qual ambiente você quer renovar.",
          }
        : askClarification;
    }

    return askClarification;
  }

  const selected: CatalogEntry[] = [];
  const nLabel = (s: string) => normalizeText(s);
  for (const item of catalog) {
    const label = nLabel(item.label);
    if (wantsRodape && label.includes("rodape")) selected.push(item);
    if (wantsPisos && models.some((m) => label.includes(m))) selected.push(item);
    if (wantsTelha && (label.includes("telha") || label.includes("shingle") || label.includes("portfolio")))
      selected.push(item);
    if (wantsRipado && (label.includes("ripado") || label.includes("wpc") || label.includes("portfolio")))
      selected.push(item);
  }

  const dedup = selected.filter(
    (item, idx) => selected.findIndex((s) => s.url === item.url) === idx
  );
  if (!dedup.length) {
    return {
      mode: "none" as const,
      reply:
        "Não achei foto específica dessa categoria no Drive agora. Posso te enviar o portfólio completo e te orientar pela linha ideal.",
    };
  }

  return {
    mode: "selected" as const,
    selected: dedup.slice(0, 6),
    intro: "Perfeito! Separei as fotos do produto que você pediu.",
  };
}

function buildQuotaFallbackReply(message: string, rag: { driveCatalog: string[] }) {
  if (isPhotoIntent(message)) {
    const catalog = parseCatalogEntries(rag.driveCatalog);
    const picked = pickCatalogByIntent(message, catalog);
    if (picked.mode === "selected") return picked.intro;
    return picked.reply;
  }

  if (hasExplorationIntent(message)) {
    return "Super normal ter essa dúvida. Se quiser, começamos com um panorama rápido do portfólio e eu te guio sem pressa. É para casa ou apartamento?";
  }

  return [
    "A Casaboni trabalha com portfólio completo de acabamentos, não apenas pisos.",
    "Hoje atuamos com pisos vinílicos clicados, rodapés de poliestireno, telhas shingle e ripados WPC.",
    "Para te orientar melhor, qual ambiente você quer transformar e qual dessas categorias te interessa primeiro?",
  ].join(" ");
}

function buildPhotoReplyFromCatalog(message: string, driveCatalog: string[]) {
  const catalog = parseCatalogEntries(driveCatalog);
  const picked = pickCatalogByIntent(message, catalog);
  if (picked.mode === "selected") {
    return {
      reply: picked.intro,
      media: buildMediaFromCatalog(picked.selected),
    };
  }
  return { reply: picked.reply, media: [] as ChatMedia[] };
}

const firebaseAppletConfigPath = path.join(__dirname, "firebase-applet-config.json");
let firebaseAppletConfig: Record<string, string> = {};
try {
  firebaseAppletConfig = JSON.parse(fs.readFileSync(firebaseAppletConfigPath, "utf8"));
} catch (error) {
  firebaseAppletConfig = {};
}

export const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket || "",
  messagingSenderId:
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId || "",
  appId: process.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId || "",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseAppletConfig.measurementId || "",
};

export const firestoreDatabaseId =
  process.env.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId || "";

const hasFirebaseConfig = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId);
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp, firestoreDatabaseId) : null;

function requireDb() {
  if (!db) {
    throw new Error("Firebase config ausente no servidor.");
  }
  return db;
}

const BASE_SYSTEM_INSTRUCTION = `Voce e o "Consultor Casaboni", consultor comercial de vendas online em arquitetura e acabamentos premium.
Seu estilo:
1. Curto e direto (2-3 frases na maioria dos casos).
2. Conversa consultiva: fazer uma pergunta por vez para orientar a escolha.
3. Texto simples, sem excesso de formatacao.
4. Entre na conversa com naturalidade, seja cordial e demonstre interesse real pelo cliente.
5. Sempre mantenha contexto do que o cliente ja respondeu; nunca repetir pergunta sem necessidade.
6. Se o cliente nao souber a metragem, ofereca caminho alternativo (faixa de tamanho: pequeno/medio/grande) e continue o atendimento.
7. Depois de entender necessidade, indique opcoes de forma filtrada (1 a 3 opcoes), nao lista extensa.
8. Em momento oportuno, colete nome e WhatsApp de forma sutil para continuar o atendimento.
9. Se o cliente pedir fotos/imagens/catalogo, nunca despejar todo o catalogo; primeiro entender a categoria desejada e enviar apenas o que for relevante.
10. Nunca limitar atendimento apenas a pisos.
11. Falar sempre em portugues do Brasil (pt-BR) e considerar horario de Brasilia (America/Sao_Paulo) para saudacoes.

Objetivos:
- Posicionar a Casaboni como consultoria comercial de ambientes.
- Priorizar primeiro contato, qualificacao e proximo passo.
- Sugerir salvar lead ou agendar consultoria quando fizer sentido.
- Mostrar portfolio completo de solucoes:
  - Pisos vinilicos clicados: Veneza, Verona, Florenca, Londres, Rio de Janeiro, Washington.
  - Rodapes de poliestireno (7cm e 10cm, liso/frisado e arredondado).
  - Telhas shingle (cores disponiveis: cinza e preto).
  - Ripados WPC (Carvalho Ipe, Peroba Jatoba, Cerejeira, Nogueira).

Base tecnica para respostas:
- Piso vinilico: resistente, a prova d'agua, praticidade na limpeza, facilidade de instalacao, conforto termico e acustico.
- Rodapes: resistentes, imunes a umidade, faceis de limpar.
- Telhas shingle: alta durabilidade, baixa manutencao, isolamento termico/acustico.
- Ripados WPC: acabamento sofisticado, alta durabilidade, baixa manutencao.
- Contato institucional quando solicitado: casaboni.com.br, Instagram @casaboni_, WhatsApp (55) 99178-0627.
`;

function getFunctionDeclarations() {
  return [
    {
      name: "saveLead",
      description:
        "Salva dados de um cliente interessado. Chame apenas quando tiver nome e telefone.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome do cliente" },
          phone: { type: Type.STRING, description: "Telefone ou WhatsApp" },
          environment: { type: Type.STRING, description: "Tipo de ambiente" },
          area: { type: Type.STRING, description: "Area em m2" },
        },
        required: ["name", "phone"],
      },
    },
    {
      name: "scheduleMeeting",
      description:
        "Agenda consultoria tecnica. Chame quando houver nome, email, data e horario.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome do cliente" },
          email: { type: Type.STRING, description: "Email do cliente" },
          phone: { type: Type.STRING, description: "Telefone" },
          date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
          time: { type: Type.STRING, description: "Horario no formato HH:MM" },
          topic: { type: Type.STRING, description: "Assunto da reuniao" },
        },
        required: ["name", "email", "date", "time"],
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
    source: args.source || "chat-agent-backend",
  };
}

async function saveLead(args: LeadProfile & { source?: string; status?: string }) {
  const payload = cleanLeadPayload(args);
  const adminDb = getAdminDb();

  if (adminDb) {
    if (payload.sessionId) {
      const existing = await adminDb.collection("leads").where("sessionId", "==", payload.sessionId).limit(1).get();
      if (!existing.empty) {
        await existing.docs[0].ref.update({
          ...payload,
          updatedAt: new Date(),
        });
        return `Lead atualizado com sucesso (id: ${existing.docs[0].id}).`;
      }
    }

    const ref = await adminDb.collection("leads").add({
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return `Lead salvo com sucesso (id: ${ref.id}).`;
  }

  const dbRef = requireDb();

  // Public Firestore rules allow lead creation, but not public reads.
  // Without Admin credentials, create directly instead of querying by session.
  const ref = await addDoc(collection(dbRef, "leads"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return `Lead salvo com sucesso (id: ${ref.id}).`;
}

async function scheduleMeeting(args: any) {
  const adminDb = getAdminDb();
  if (adminDb) {
    const ref = await adminDb.collection("meetings").add({
      customerName: args?.name || "",
      customerEmail: args?.email || "",
      phone: args?.phone || "",
      date: args?.date || "",
      time: args?.time || "",
      topic: args?.topic || "Consultoria Tecnica",
      status: "Agendada",
      source: "chat-agent-backend",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return `Reuniao agendada com sucesso (id: ${ref.id}).`;
  }

  const dbRef = requireDb();
  const ref = await addDoc(collection(dbRef, "meetings"), {
    customerName: args?.name || "",
    customerEmail: args?.email || "",
    phone: args?.phone || "",
    date: args?.date || "",
    time: args?.time || "",
    topic: args?.topic || "Consultoria Tecnica",
    status: "Agendada",
    source: "chat-agent-backend",
    createdAt: serverTimestamp(),
  });
  return `Reuniao agendada com sucesso (id: ${ref.id}).`;
}

function buildHistoryText(history: ChatMessage[]) {
  return history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Cliente" : "Consultor"}: ${m.text}`)
    .join("\n");
}

function extractPhone(text: string) {
  const match = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
  if (!match) return "";
  const digits = match[1].replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(0, 13);
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
    /\bnome\s*[:\-]\s*([\p{L}'\s]{3,80})/iu,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const cleaned = match[1]
      .split(/\b(?:whatsapp|telefone|celular|email|data|horario|às|as|e meu|meu|zap)\b/i)[0]
      .split(/[,.!?\n]/)[0]
      .trim();
    if (cleaned.length >= 3) return toNameCase(cleaned);
  }

  const fallback = normalized.match(/(?:meu nome|nome)\s*(?:e|eh)?\s*([a-z\s]{3,80})/i);
  if (fallback?.[1]) {
    return toNameCase(
      fallback[1]
      .split(/\b(?:whatsapp|telefone|celular|email|data|horario|as|e meu|meu|zap)\b/i)[0]
      .split(/[,.!?\n]/)[0]
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
      .split(/[,.!?\n]/)[0]
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

function hasPositiveChoiceIntent(text: string) {
  const n = normalizeText(text);
  return /gostei|curti|amei|prefiro|quero esse|quero essa|esse mesmo|essa mesmo|ficou bom|me agradou/.test(n);
}

function hasQuoteIntent(text: string) {
  const n = normalizeText(text);
  return hasPriceIntent(text) || /orcamento|orçamento|orc|proposta|comprar|fechar|pedido|quanto fica|me passa valor|quero simular/.test(n);
}

function isYesIntent(text: string) {
  const n = normalizeText(text).trim();
  return /^(sim|quero|claro|pode|pode sim|vamos|bora|ok|fechado|manda|me chama|quero sim)$/.test(n);
}

function contextText(history: ChatMessage[], message: string, role: "user" | "bot" = "user") {
  return [
    ...history
      .filter((m) => m.role === role)
      .slice(-12)
      .map((m) => m.text),
    role === "user" ? message : "",
  ]
    .filter(Boolean)
    .join(" ");
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

function compactProductLabel(profile: LeadProfile) {
  return [profile.product, profile.category].filter(Boolean).join(" / ") || "";
}

function buildContactRequest(profile: LeadProfile) {
  if (!profile.name && !profile.phone) {
    return "Consigo deixar isso encaminhado para or\u00e7amento. Qual seu nome e WhatsApp para eu salvar seu atendimento e a equipe retornar certinho?";
  }
  if (!profile.name) {
    return "Perfeito, recebi seu WhatsApp. Qual seu nome para eu deixar o atendimento identificado no CRM?";
  }
  if (!profile.phone) {
    return `Perfeito, ${profile.name}. Qual WhatsApp posso salvar para a equipe te retornar com o pr\u00f3ximo passo?`;
  }
  if (!profile.city) {
    return `Perfeito, ${profile.name}. J\u00e1 deixei seu atendimento salvo. De qual cidade voc\u00ea fala? Assim eu direciono melhor disponibilidade e pr\u00f3ximo passo.`;
  }
  return `Perfeito, ${profile.name}. J\u00e1 deixei seu atendimento salvo com a cidade ${profile.city}. Quer que eu siga refinando as op\u00e7\u00f5es por aqui ou prefere que a equipe te chame no WhatsApp?`;
}

function buildCommercialReply(message: string, history: ChatMessage[], profile: LeadProfile) {
  const lastBotText = contextText(history, "", "bot");
  const normalizedLastBot = normalizeText(lastBotText);
  const botOfferedQuote =
    normalizedLastBot.includes("orcamento") ||
    /or.{0,3}amento/.test(normalizedLastBot) ||
    normalizedLastBot.includes("salvar seu atendimento") ||
    normalizedLastBot.includes("equipe retornar") ||
    normalizedLastBot.includes("proximo passo");
  const model = extractProductModel(message) || profile.product;
  const enoughToQuote = Boolean(
    (profile.product || profile.category) && (profile.environment || profile.propertyType) && (profile.area || profile.style)
  );

  if (profile.name && profile.phone && /whatsapp|telefone|celular|meu nome|nome|cidade|moro|sou de/i.test(message)) {
    return buildContactRequest(profile);
  }

  if ((hasQuoteIntent(message) || (isYesIntent(message) && (botOfferedQuote || enoughToQuote))) && (!profile.name || !profile.phone || !profile.city)) {
    return buildContactRequest(profile);
  }

  if (hasPositiveChoiceIntent(message) && model) {
    if (!profile.environment) {
      return `${model} \u00e9 uma boa escolha. Para eu te orientar melhor, ele seria para qual ambiente: sala, quarto, cozinha ou outro espa\u00e7o?`;
    }
    if (!profile.area) {
      return `Boa escolha. Para ${profile.environment}, o ${model} pode funcionar muito bem. Qual a metragem aproximada para eu te orientar com mais seguran\u00e7a?`;
    }
    return `Boa escolha, o ${model} combina bem com ${profile.environment} de ${profile.area}. Quer que eu encaminhe um or\u00e7amento inicial? Se sim, me passe nome e WhatsApp.`;
  }

  if (enoughToQuote && !botOfferedQuote && !isPhotoIntent(message)) {
    const item = compactProductLabel(profile);
    return `Com o que voc\u00ea me passou${item ? ` sobre ${item}` : ""}, j\u00e1 d\u00e1 para avan\u00e7ar. Quer que eu encaminhe um or\u00e7amento inicial? Se sim, me passe seu nome e WhatsApp.`;
  }

  return "";
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
  const normalized = normalizeText(text);
  if (normalized.includes("apartamento") || normalized.includes("apto")) return "apartamento";
  if (normalized.includes("casa") || normalized.includes("sobrado")) return "casa";
  return "";
}

function hasMeetingIntent(text: string) {
  return /agendar|reuniao|reuniao|consultoria/.test(text.toLowerCase());
}

function hasLeadIntent(text: string) {
  return /salvar|cadastro|cadastrar|contato|whatsapp/.test(text.toLowerCase());
}

function hasFrustrationIntent(text: string) {
  const n = normalizeText(text);
  return /nao entende|nao entendeu|nao entende nada|errado|nada a ver|burro|burra|repetindo|voce nao entende|vc nao entende/.test(n);
}

type ProductCategory = "pisos" | "rodapes" | "telhas" | "ripados";

function detectCategory(text: string): ProductCategory | null {
  const normalized = normalizeText(text);
  if (normalized.includes("piso") || normalized.includes("vinil")) return "pisos";
  if (normalized.includes("rodape")) return "rodapes";
  if (normalized.includes("telha") || normalized.includes("shingle")) return "telhas";
  if (normalized.includes("ripado") || normalized.includes("wpc")) return "ripados";
  return null;
}

function isGreeting(text: string) {
  const normalized = normalizeText(text).trim();
  const short = normalized.split(/\s+/).length <= 3;
  return short && /^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hello)$/.test(normalized);
}

function hasPriceIntent(text: string) {
  return /preco|valor|orcamento|quanto custa/.test(normalizeText(text));
}

function hasExplorationIntent(text: string) {
  const normalized = normalizeText(text);
  const raw = text.toLowerCase();
  return (
    /nao sei bem|nao sei o que|nao sei escolher|estou em duvida|to em duvida|indecis|so olhando|sugestoes|ideias|me ajuda a escolher/.test(
      normalized
    ) || /n.o sei bem|n.o sei o que|n.o sei escolher|duvid/.test(raw)
  );
}

function hasUnknownAreaIntent(text: string) {
  const normalized = normalizeText(text);
  const raw = text.toLowerCase();
  const mentionsAreaContext =
    /metragem|medida|area|m2|m\u00b2|metro/.test(normalized) || /\b\d+\s*m(?:2|\u00b2)?\b/i.test(raw);
  return (
    /sem metragem|sem medida/.test(normalized) ||
    (/nao lembro|nao sei|sem ideia|nao tenho ideia|nao tenho certeza|nao recordo|nao faco ideia/.test(
      normalized
    ) &&
      mentionsAreaContext) ||
    (/n.o lembro|n.o sei|n.o tenho certeza|n.o recordo/.test(raw) && mentionsAreaContext)
  );
}

function extractStyle(text: string) {
  const normalized = normalizeText(text);
  if (/(amadeirad|madeira|aconcheg)/.test(normalized)) return "amadeirado";
  if (/(moderno|minimal|clean|contemporane)/.test(normalized)) return "moderno";
  if (/(claro|bege|off white|off-white|branco)/.test(normalized)) return "claro";
  if (/(escuro|grafite|cinza|preto)/.test(normalized)) return "escuro";
  if (/(rustic|rustico|natural)/.test(normalized)) return "r\u00fastico";
  return "";
}

function extractAreaBand(text: string) {
  const normalized = normalizeText(text);
  const raw = text.toLowerCase();
  if (/(pequen|ate 20|ate20|mini|compact)/.test(normalized)) return "pequeno";
  if (/(medio|20 a 50|20-50|entre 20 e 50)/.test(normalized) || /m.{1,3}dio/.test(raw))
    return "medio";
  if (/(grand|acima de 50|mais de 50|50\+|amplo)/.test(normalized)) return "grande";
  return "";
}

function parseAreaNumber(area: string) {
  const match = area.match(/(\d{1,4})([.,]\d{1,2})?/);
  if (!match) return 0;
  return Number(match[0].replace(",", "."));
}

function extractArea(text: string) {
  const normalized = normalizeText(text).trim();
  const directNumber = normalized.match(/^(\d{1,4})([.,]\d{1,2})?$/);
  if (directNumber) return `${directNumber[1]}m\u00b2`;

  const match = normalized.match(/\b(\d{1,4})([.,]\d{1,2})?\s*(m2|m\u00b2|m|metros?|metro)\b/i);
  if (!match) return "";
  return `${match[1]}m\u00b2`;
}

function summarizeUserHistory(history: ChatMessage[]) {
  const userTexts = history
    .filter((m) => m.role === "user")
    .slice(-8)
    .map((m) => m.text);
  const text = userTexts.join(" ");
  const lastBotText = history
    .filter((m) => m.role === "bot")
    .slice(-3)
    .map((m) => m.text)
    .join(" ");
  const latestFromUserHistory = (extractor: (text: string) => string) =>
    [...userTexts].reverse().map(extractor).find(Boolean) || "";
  const environments = extractEnvironments(text);

  return {
    category: detectCategory(text),
    environment: latestFromUserHistory(extractEnvironment) || environments[0] || "",
    environments,
    propertyType: latestFromUserHistory(extractPropertyType) || extractPropertyType(text),
    area: latestFromUserHistory(extractArea) || extractArea(text),
    areaBand: latestFromUserHistory(extractAreaBand) || extractAreaBand(text),
    style: latestFromUserHistory(extractStyle) || extractStyle(text),
    botAskedArea: /metragem|m\u00b2|m2/.test(normalizeText(lastBotText)),
    botEnvironment: extractEnvironment(lastBotText),
    greeted: history.some(
      (m) => m.role === "bot" && normalizeText(m.text).includes("sou o consultor casaboni")
    ),
  };
}

function buildGuidedConsultingReply(message: string, history: ChatMessage[]) {
  const hist = summarizeUserHistory(history);
  const category = detectCategory(message) || hist.category;
  const environment = extractEnvironment(message) || hist.environment || hist.botEnvironment;
  const propertyType = extractPropertyType(message) || hist.propertyType;
  const area = extractArea(message) || hist.area;
  const areaBand = extractAreaBand(message) || hist.areaBand;
  const style = extractStyle(message) || hist.style;
  const currentEnvironments = extractEnvironments(message);
  const environments = currentEnvironments.length ? currentEnvironments : hist.environments;
  const areaNumber = parseAreaNumber(area);
  const likelyAreaTypingMistake =
    !!area &&
    areaNumber > 0 &&
    areaNumber < 10 &&
    /(sala|quarto|cozinha|comercial|apartamento|casa)/.test(normalizeText(environment || message));

  if (isGreeting(message)) {
    if (hist.greeted && category && environment && !area) {
      return "Perfeito, seguimos juntos. Se você não tiver a metragem exata, eu te ajudo por faixa: até 20m², 20 a 50m² ou acima de 50m².";
    }
    return "Olá! Sou o Consultor Casaboni. Estou aqui para te atender e te ajudar a escolher a melhor solução para seu ambiente. Qual espaço você quer transformar hoje?";
  }

  if (hasFrustrationIntent(message)) {
    const known = [category, environment, area, style].filter(Boolean).join(", ");
    return known
      ? `Voc\u00ea tem raz\u00e3o, eu me perdi no contexto. J\u00e1 tenho aqui: ${known}. Vamos seguir de forma simples: quer que eu te mostre um recorte visual do portf\u00f3lio ou prefere que eu indique 2 op\u00e7\u00f5es mais seguras?`
      : "Voc\u00ea tem raz\u00e3o, eu me perdi. Vamos recome\u00e7ar de forma simples: \u00e9 para casa ou apartamento, e qual ambiente voc\u00ea quer transformar primeiro?";
  }

  if (currentEnvironments.length > 1 && category && !extractArea(message)) {
    return `Perfeito, vamos organizar por partes para n\u00e3o misturar a indica\u00e7\u00e3o. Come\u00e7amos por ${currentEnvironments[0]} ou ${currentEnvironments[1]}? Depois eu te ajudo a manter harmonia entre os ambientes.`;
  }

  if (hasPriceIntent(message) && !category) {
    return "Consigo te orientar com orçamento. Primeiro me diga a categoria: pisos, rodapés, telhas ou ripados.";
  }

  if (hasExplorationIntent(message) && environment && !category) {
    return `Essa dúvida é normal. Para ${environment}, a gente pode começar pelo que mais muda a sensação do ambiente: piso, rodapé, ripado ou telha. Quer folhear um recorte do portfólio para comparar estilos antes de decidir?`;
  }

  if (hasExplorationIntent(message) && !category) {
    return "Super normal ter essa dúvida, e eu te ajudo sem pressa. Se quiser, eu te mostro um resumo visual do portfólio primeiro; antes disso, me diz: é casa ou apartamento?";
  }

  if (hasExplorationIntent(message) && category && environment && area) {
    const productLabel = category === "pisos" ? "piso" : category;
    return `Sem problema, escolher ${productLabel} costuma gerar dúvida mesmo. Para ${environment} com ${area}, eu começaria comparando 2 ou 3 estilos: claro, amadeirado e moderno. Quer que eu te mostre um recorte visual do portfólio para você sentir qual combina mais?`;
  }

  if (hasExplorationIntent(message) && category && environment) {
    return `Sem problema, eu te ajudo a escolher com calma. Para ${environment}, primeiro vale pensar no efeito que você quer: mais aconchegante, mais claro ou mais moderno. Quer folhear algumas opções do portfólio para sentir o estilo?`;
  }

  if (propertyType && !category && !environment) {
    return `Perfeito, ${propertyType}. Qual ambiente você mais usa no dia a dia e quer renovar primeiro? Se preferir, também te mostro um recorte do portfólio para inspirar.`;
  }

  if (hasUnknownAreaIntent(message) && (hist.botAskedArea || (category && environment && !area))) {
    return "Sem problema. Podemos seguir sem medida exata: me diga se esse ambiente é pequeno, médio ou grande que eu já te indico opções certeiras.";
  }

  if (!category && environment && !area) {
    return `Perfeito, ${environment}. Para eu te indicar com precisão, você quer pisos, rodapés, telhas shingle ou ripados?`;
  }

  if (area && environment && !category) {
    return `Perfeito, ${environment} com ${area}. Para eu te indicar com precisão, você quer pisos, rodapés, telhas shingle ou ripados?`;
  }

  if (area && !environment && category) {
    return `Perfeito, já anotei ${area}. Para ${category}, qual ambiente você quer transformar?`;
  }

  if (category && !environment) {
    return `Perfeito. Para ${category}, qual ambiente você quer transformar?`;
  }

  if (category && environment && !area) {
    if (areaBand) {
      const bandLabel = areaBand === "medio" ? "médio" : areaBand;
      if (!style) {
        return `Perfeito, ${environment} de porte ${bandLabel}. Você prefere um visual mais claro, amadeirado, moderno ou rústico?`;
      }
      return `Excelente. Para ${environment} de porte ${bandLabel} e estilo ${style}, eu já consigo te mostrar opções mais alinhadas e o próximo passo de orçamento.`;
    }
    if (hasUnknownAreaIntent(message)) {
      return "Sem problema. Podemos começar sem a metragem exata. Me diga se o ambiente é pequeno, médio ou grande que eu já te indico opções mais assertivas.";
    }
    return `Ótimo, ${environment}. Qual a metragem aproximada em m² para eu te orientar com mais precisão?`;
  }

  if (category && environment && area) {
    if (likelyAreaTypingMistake) {
      return `Perfeito, ${environment}. Só confirmando para eu não errar na indicação: são ${area} mesmo ou seria ${areaNumber}0m²?`;
    }
    if (!style) {
      return `Perfeito, ${environment} com ${area}. Você prefere um visual mais claro, amadeirado, moderno ou rústico?`;
    }
    return `Excelente. Para ${environment} com ${area} e estilo ${style}, eu já consigo te mostrar as opções mais alinhadas e o próximo passo de orçamento.`;
  }

  return "";
}

async function fetchRagContext(message: string, customerContext?: string) {
  const webhookUrl = process.env.N8N_RAG_WEBHOOK_URL;
  const driveFolderId = process.env.N8N_DRIVE_FOLDER_ID || "";
  if (!webhookUrl) {
    return { ragPromptContext: "", filesFound: 0, driveCatalog: [] as string[] };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        question: message,
        driveFolderId,
        customerContext: customerContext || "",
      }),
    });

    if (!response.ok) {
      throw new Error(`RAG webhook HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      ragPromptContext: data?.ragPromptContext || "",
      filesFound: Number(data?.filesFound || 0),
      driveCatalog: Array.isArray(data?.driveCatalog) ? data.driveCatalog : [],
    };
  } catch (error) {
    console.error("RAG webhook error:", error);
    return { ragPromptContext: "", filesFound: 0, driveCatalog: [] as string[] };
  }
}

export async function chatWithGemini(input: {
  message: string;
  history: ChatMessage[];
  customerContext?: string;
  sessionId?: string;
}) {
  const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

  const ragContext = await fetchRagContext(input.message, input.customerContext);

  const handlePhotoFlow = isPhotoIntent(input.message) || isPhotoFollowUpSelection(input.history, input.message);
  if (handlePhotoFlow) {
    const photoReply = buildPhotoReplyFromCatalog(input.message, ragContext.driveCatalog);
    return {
      reply: photoReply.reply,
      media: photoReply.media,
      source: "photo-flow",
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  // Deterministic CRM fallback to ensure automatic capture even when model tool-calling fails.
  const maybeName = extractName(input.message);
  const maybePhone = extractPhone(input.message);
  const maybeEmail = extractEmail(input.message);
  const maybeDate = extractDate(input.message);
  const maybeTime = extractTime(input.message);
  const leadProfile = buildLeadProfile(input.history, input.message, input.sessionId);

  if (hasMeetingIntent(input.message) && maybeName && maybeEmail && maybeDate && maybeTime) {
    try {
      await scheduleMeeting({
        name: maybeName,
        email: maybeEmail,
        phone: maybePhone,
        date: maybeDate,
        time: maybeTime,
        topic: "Consultoria T\u00e9cnica",
      });
    } catch (error) {
      console.error("Deterministic scheduleMeeting fallback error:", error);
    }
    return {
      reply: `Perfeito, ${maybeName}. Reunião agendada para ${maybeDate} às ${maybeTime}. Se quiser, já me diga o ambiente e a metragem para adiantarmos a consultoria.`,
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  if ((hasLeadIntent(input.message) || maybePhone) && maybeName && maybePhone) {
    let leadSaved = false;
    try {
      await saveLead({
        ...leadProfile,
        name: maybeName,
        phone: maybePhone,
        environment: leadProfile.environment || extractEnvironment(input.message),
        area: leadProfile.area || extractArea(input.message),
      });
      leadSaved = true;
    } catch (error) {
      console.error("Deterministic saveLead fallback error:", error);
    }
    return {
      reply: leadProfile.city
        ? `Perfeito, ${maybeName}. Seus dados j\u00e1 foram cadastrados. Quer que eu encaminhe o pr\u00f3ximo passo de or\u00e7amento pelo WhatsApp?`
        : `Perfeito, ${maybeName}. Seus dados j\u00e1 foram cadastrados. De qual cidade voc\u00ea fala? Assim eu direciono melhor disponibilidade e pr\u00f3ximo passo.`,
      leadSaved,
      source: "lead-flow",
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  if ((hasLeadIntent(input.message) || maybePhone) && (!maybeName || !maybePhone)) {
    const missingLead = !maybeName ? "nome completo" : "telefone/WhatsApp";
    return {
      reply: `Perfeito, posso cadastrar seu contato. Me informe seu ${missingLead}.`,
      source: "lead-flow",
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  if (leadProfile.name && leadProfile.phone) {
    try {
      await saveLead(leadProfile);
    } catch (error) {
      console.error("Commercial lead upsert error:", error);
    }
  }

  const commercialReply = buildCommercialReply(input.message, input.history, leadProfile);
  if (commercialReply) {
    return {
      reply: commercialReply,
      source: "commercial-flow",
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  const guidedReply = buildGuidedConsultingReply(input.message, input.history);
  if (guidedReply) {
    return {
      reply: guidedReply,
      source: "guided-flow",
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  if (!geminiApiKey) {
    return {
      reply: buildQuotaFallbackReply(input.message, {
        driveCatalog: ragContext.driveCatalog,
      }),
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  try {
    const chat = ai.chats.create({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      config: {
        temperature: 0.2,
        maxOutputTokens: 320,
        systemInstruction:
          BASE_SYSTEM_INSTRUCTION +
          "\n\nRegras de resposta obrigatórias: nunca inventar produto/preço/prazo, manter continuidade com histórico e fazer apenas 1 pergunta por vez quando faltar contexto." +
          (ragContext.ragPromptContext
            ? `\n\nContexto RAG do Drive:\n${ragContext.ragPromptContext}`
            : ""),
        tools: [{ functionDeclarations: getFunctionDeclarations() }],
      },
    });

    const conversation = [
      buildHistoryText(input.history),
      `Cliente: ${input.message}`,
      input.customerContext ? `Contexto adicional: ${input.customerContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let response = await chat.sendMessage({ message: conversation });
    let turnLimit = 3;
    while (response.functionCalls && response.functionCalls.length > 0 && turnLimit > 0) {
      turnLimit -= 1;
      const toolResults: string[] = [];

      for (const call of response.functionCalls) {
        try {
          if (call.name === "saveLead") {
            toolResults.push(await saveLead(call.args));
          } else if (call.name === "scheduleMeeting") {
            toolResults.push(await scheduleMeeting(call.args));
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

    return {
      reply: response.text || "Pode repetir, por favor?",
      source: "gemini",
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const quotaExceeded =
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.toLowerCase().includes("quota") ||
      msg.includes("429");

    if (quotaExceeded) {
      const photoReply = handlePhotoFlow
        ? buildPhotoReplyFromCatalog(input.message, ragContext.driveCatalog)
        : null;
      return {
        reply:
          photoReply?.reply ||
          buildQuotaFallbackReply(input.message, {
            driveCatalog: ragContext.driveCatalog,
          }),
        media: photoReply?.media || ([] as ChatMedia[]),
        rag: {
          filesFound: ragContext.filesFound,
          driveCatalog: ragContext.driveCatalog,
        },
      };
    }

    console.error("Gemini fallback error:", error);
    const photoReply = handlePhotoFlow
      ? buildPhotoReplyFromCatalog(input.message, ragContext.driveCatalog)
      : null;
    return {
      reply:
        photoReply?.reply ||
        "Estou aqui para te ajudar com pisos, rodapés, telhas e ripados. Me diga qual ambiente você quer transformar para eu te orientar no produto ideal.",
      media: photoReply?.media || ([] as ChatMedia[]),
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }
}

export function registerApiRoutes(app: express.Express) {
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/rag/health", (req, res) => {
    res.json({
      status: "ok",
      n8nWebhookConfigured: Boolean(process.env.N8N_RAG_WEBHOOK_URL),
      driveFolderConfigured: Boolean(process.env.N8N_DRIVE_FOLDER_ID),
      firebaseProjectId: firebaseConfig.projectId,
      firestoreDatabaseId,
    });
  });

  app.get(["/api/drive-image", "/api/drive-image/:id"], async (req, res) => {
    try {
      const id = String(req.params.id || req.query.id || "").trim();
      const mode = req.query.mode === "thumb" ? "thumb" : "auto";
      if (!isValidDriveFileId(id)) {
        res.status(400).json({ ok: false, error: "Invalid file id" });
        return;
      }

      const image = await fetchDriveImage(id, mode);
      if (!image) {
        res.status(404).json({ ok: false, error: "Image not found" });
        return;
      }

      res.setHeader("Content-Type", image.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(image.bytes);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/drive-image", async (req, res) => {
    try {
      const idParam = req.query.id;
      const id = Array.isArray(idParam) ? String(idParam[0] || "").trim() : String(idParam || "").trim();
      const mode = req.query.mode === "thumb" ? "thumb" : "auto";
      if (!isValidDriveFileId(id)) {
        res.status(400).json({ ok: false, error: "Invalid file id" });
        return;
      }

      const image = await fetchDriveImage(id, mode);
      if (!image) {
        res.status(404).json({ ok: false, error: "Image not found" });
        return;
      }

      res.setHeader("Content-Type", image.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(image.bytes);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      const history = Array.isArray(req.body?.history) ? (req.body.history as ChatMessage[]) : [];
      const customerContext = String(req.body?.customerContext || "").trim();
      const sessionId = String(req.body?.sessionId || "").trim();

      if (!message) {
        res.status(400).json({ ok: false, error: "Mensagem vazia" });
        return;
      }

      const result = await chatWithGemini({ message, history, customerContext, sessionId });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("POST /api/chat error:", error);
      const message = String(req.body?.message || "").trim();
      const fallbackReply = message
        ? buildQuotaFallbackReply(message, { driveCatalog: [] })
        : "Estou aqui para te ajudar com a escolha do produto ideal. Me diga ambiente e metragem aproximada.";
      res.status(200).json({
        ok: true,
        reply: fallbackReply,
        media: [],
      });
    }
  });
}

export async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  registerApiRoutes(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer();
}
