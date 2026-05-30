import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { addDoc, collection, getFirestore, serverTimestamp } from "firebase/firestore";

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

function isPhotoIntent(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("foto") ||
    normalized.includes("fotos") ||
    normalized.includes("imagem") ||
    normalized.includes("imagens") ||
    normalized.includes("catÃ¡logo") ||
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
  const hasCategory = hasCategoryMention(message);
  if (!hasCategory || history.length === 0) return false;
  const lastBot = [...history].reverse().find((h) => h.role === "bot")?.text || "";
  const normalized = normalizeText(lastBot);
  return (
    normalized.includes("qual produto voce quer ver primeiro") ||
    normalized.includes("tenho fotos de pisos") ||
    normalized.includes("separo por categoria")
  );
}

function pickCatalogByIntent(message: string, catalog: CatalogEntry[]) {
  const normalized = normalizeText(message);
  const wantsPortfolio = /portfolio|portifolio|catalogo|inspiracao|inspirar/.test(normalized);
  const askClarification = {
    mode: "clarify" as const,
    reply:
      "Tenho fotos de pisos, rodapÃ©s, telhas shingle e ripados. Qual produto vocÃª quer ver primeiro?",
  };

  if (!catalog.length) {
    return {
      mode: "empty" as const,
      reply:
        "Ainda nÃ£o encontrei imagens no catÃ¡logo do Drive. Posso te enviar o portfÃ³lio geral enquanto isso?",
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
          reply: `NÃ£o encontrei foto da linha ${matchedModel} no Drive agora. Posso te mandar as linhas mais prÃ³ximas disponÃ­veis?`,
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
              "Claro. Separei um recorte visual do portfolio para voce folhear primeiro. Depois me diga qual ambiente voce quer renovar.",
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
        "NÃ£o achei foto especÃ­fica dessa categoria no Drive agora. Posso te enviar o portfÃ³lio completo e te orientar pela linha ideal.",
    };
  }

  return {
    mode: "selected" as const,
    selected: dedup.slice(0, 6),
    intro: "Perfeito! Separei as fotos do produto que vocÃª pediu.",
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
    return "Super normal ter essa duvida. Se quiser, comecamos com um panorama rapido do portfolio e eu te guio sem pressa. E para casa ou apartamento?";
  }

  return [
    "A Casaboni trabalha com portfÃ³lio completo de acabamentos, nÃ£o apenas pisos.",
    "Hoje atuamos com pisos vinÃ­licos clicados, rodapÃ©s de poliestireno, telhas shingle e ripados WPC.",
    "Para te orientar melhor, qual ambiente vocÃª quer transformar e qual dessas categorias te interessa primeiro?",
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
9. Se o cliente pedir fotos/imagens/catÃ¡logo, nunca despejar todo o catÃ¡logo; primeiro entender a categoria desejada e enviar apenas o que for relevante.
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

async function saveLead(args: any) {
  const dbRef = requireDb();
  const ref = await addDoc(collection(dbRef, "leads"), {
    name: args?.name || "",
    phone: args?.phone || "",
    environment: args?.environment || "",
    area: args?.area || "",
    date: new Date().toISOString().slice(0, 10),
    status: "Novo",
    source: "chat-agent-backend",
    createdAt: serverTimestamp(),
  });
  return `Lead salvo com sucesso (id: ${ref.id}).`;
}

async function scheduleMeeting(args: any) {
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

function extractEnvironment(text: string) {
  const normalized = normalizeText(text);
  if (normalized.includes("sala")) return "Sala";
  if (normalized.includes("quarto")) return "Quarto";
  if (normalized.includes("cozinha")) return "Cozinha";
  if (normalized.includes("escritorio")) return "Escritório";
  if (normalized.includes("area gourmet")) return "Área Gourmet";
  if (normalized.includes("comercial")) return "Comercial";
  return "";
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
  return /preco|valor|orcamento|orÃ§amento|quanto custa|preÃ§o/.test(normalizeText(text));
}

function hasExplorationIntent(text: string) {
  const normalized = normalizeText(text);
  const raw = text.toLowerCase();
  return (
    /nao sei bem|nao sei o que|estou em duvida|to em duvida|indecis|so olhando|sugestoes|ideias|me ajuda a escolher/.test(
      normalized
    ) || /n.o sei bem|n.o sei o que|duvid/.test(raw)
  );
}

function hasUnknownAreaIntent(text: string) {
  const normalized = normalizeText(text);
  const raw = text.toLowerCase();
  return (
    /nao lembro|nao sei|sem ideia|nao tenho ideia|nao tenho certeza|nao recordo|nao faco ideia|sem metragem|sem medida/.test(
      normalized
    ) || /n.o lembro|n.o sei|n.o tenho certeza|n.o recordo/.test(raw)
  );
}

function extractStyle(text: string) {
  const normalized = normalizeText(text);
  if (/(amadeirad|madeira|aconcheg)/.test(normalized)) return "amadeirado";
  if (/(moderno|minimal|clean|contemporane)/.test(normalized)) return "moderno";
  if (/(claro|bege|off white|off-white|branco)/.test(normalized)) return "claro";
  if (/(escuro|grafite|cinza|preto)/.test(normalized)) return "escuro";
  if (/(rustic|rÃºstic|natural)/.test(normalized)) return "rÃºstico";
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
  if (directNumber) return `${directNumber[1]}mÂ²`;

  const match = normalized.match(/\b(\d{1,4})([.,]\d{1,2})?\s*(m2|mÂ²|m|metros?|metro)\b/i);
  if (!match) return "";
  return `${match[1]}mÂ²`;
}

function summarizeUserHistory(history: ChatMessage[]) {
  const text = history
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.text)
    .join(" ");
  const lastBotText = history
    .filter((m) => m.role === "bot")
    .slice(-3)
    .map((m) => m.text)
    .join(" ");

  return {
    category: detectCategory(text),
    environment: extractEnvironment(text),
    propertyType: extractPropertyType(text),
    area: extractArea(text),
    areaBand: extractAreaBand(text),
    style: extractStyle(text),
    botAskedArea: /metragem|mÂ²|m2/.test(normalizeText(lastBotText)),
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
  const areaNumber = parseAreaNumber(area);
  const messageNormalized = normalizeText(message);
  const likelyAreaTypingMistake =
    !!area &&
    areaNumber > 0 &&
    areaNumber < 10 &&
    /(sala|quarto|cozinha|comercial|apartamento|casa)/.test(normalizeText(environment || message));

  if (isGreeting(message)) {
    if (hist.greeted && category && environment && !area) {
      return "Perfeito, seguimos juntos. Se vocÃª nÃ£o tiver a metragem exata, eu te ajudo por faixa: atÃ© 20mÂ², 20 a 50mÂ² ou acima de 50mÂ².";
    }
    return "OlÃ¡! Sou o Consultor Casaboni. Estou aqui para te atender e te ajudar a escolher a melhor soluÃ§Ã£o para seu ambiente. Qual espaÃ§o vocÃª quer transformar hoje?";
  }

  if (hasPriceIntent(message) && !category) {
    return "Consigo te orientar com orÃ§amento. Primeiro me diga a categoria: pisos, rodapÃ©s, telhas ou ripados.";
  }

  if (hasExplorationIntent(message) && !category) {
    return "Super normal ter essa duvida, e eu te ajudo sem pressa. Se quiser, eu te mostro um resumo visual do portfolio primeiro; antes disso, me diz: e para casa ou apartamento?";
  }

  if (propertyType && !category && !environment) {
    return `Perfeito, ${propertyType}. Qual ambiente voce mais usa no dia a dia e quer renovar primeiro? Se preferir, tambem te mostro um recorte do portfolio para inspirar.`;
  }

  if (hasUnknownAreaIntent(message) && (hist.botAskedArea || (category && environment && !area))) {
    return "Sem problema. Podemos seguir sem medida exata: me diga se esse ambiente Ã© pequeno, mÃ©dio ou grande que eu jÃ¡ te indico opÃ§Ãµes certeiras.";
  }

  if (!category && environment && !area) {
    return `Perfeito, ${environment}. Para eu te indicar com precisÃ£o, vocÃª quer pisos, rodapÃ©s, telhas shingle ou ripados?`;
  }

  if (area && environment && !category) {
    return `Perfeito, ${environment} com ${area}. Para eu te indicar com precisÃ£o, vocÃª quer pisos, rodapÃ©s, telhas shingle ou ripados?`;
  }

  if (area && !environment && category) {
    return `Perfeito, jÃ¡ anotei ${area}. Para ${category}, qual ambiente vocÃª quer transformar?`;
  }

  if (category && !environment) {
    return `Perfeito. Para ${category}, qual ambiente vocÃª quer transformar?`;
  }

  if (category && environment && !area) {
    if (areaBand) {
      const bandLabel = areaBand === "medio" ? "mÃ©dio" : areaBand;
      if (!style) {
        return `Perfeito, ${environment} de porte ${bandLabel}. VocÃª prefere um visual mais claro, amadeirado, moderno ou rÃºstico?`;
      }
      return `Excelente. Para ${environment} de porte ${bandLabel} e estilo ${style}, eu jÃ¡ consigo te mostrar opÃ§Ãµes mais alinhadas e o prÃ³ximo passo de orÃ§amento.`;
    }
    if (hasUnknownAreaIntent(message) || /nao lembro|nao sei|sem metragem/.test(messageNormalized)) {
      return "Sem problema. Podemos comeÃ§ar sem a metragem exata. Me diga se o ambiente Ã© pequeno, mÃ©dio ou grande que eu jÃ¡ te indico opÃ§Ãµes mais assertivas.";
    }
    return `Ã“timo, ${environment}. Qual a metragem aproximada em mÂ² para eu te orientar com mais precisÃ£o?`;
  }

  if (category && environment && area) {
    if (likelyAreaTypingMistake) {
      return `Perfeito, ${environment}. SÃ³ confirmando para eu nÃ£o errar na indicaÃ§Ã£o: sÃ£o ${area} mesmo ou seria ${areaNumber}0mÂ²?`;
    }
    if (!style) {
      return `Perfeito, ${environment} com ${area}. VocÃª prefere um visual mais claro, amadeirado, moderno ou rÃºstico?`;
    }
    return `Excelente. Para ${environment} com ${area} e estilo ${style}, eu jÃ¡ consigo te mostrar as opÃ§Ãµes mais alinhadas e o prÃ³ximo passo de orÃ§amento.`;
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
}) {
  const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

  const ragContext = await fetchRagContext(input.message, input.customerContext);

  const handlePhotoFlow = isPhotoIntent(input.message) || isPhotoFollowUpSelection(input.history, input.message);
  if (handlePhotoFlow) {
    const photoReply = buildPhotoReplyFromCatalog(input.message, ragContext.driveCatalog);
    return {
      reply: photoReply.reply,
      media: photoReply.media,
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

  if (hasMeetingIntent(input.message) && maybeName && maybeEmail && maybeDate && maybeTime) {
    try {
      await scheduleMeeting({
        name: maybeName,
        email: maybeEmail,
        phone: maybePhone,
        date: maybeDate,
        time: maybeTime,
        topic: "Consultoria TÃ©cnica",
      });
    } catch (error) {
      console.error("Deterministic scheduleMeeting fallback error:", error);
    }
    return {
      reply: `Perfeito, ${maybeName}. reuniao agendada para ${maybeDate} Ã s ${maybeTime}. Se quiser, jÃ¡ me diga o ambiente e a metragem para adiantarmos a consultoria.`,
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  if ((hasLeadIntent(input.message) || maybePhone) && maybeName && maybePhone) {
    try {
      await saveLead({
        name: maybeName,
        phone: maybePhone,
        environment: extractEnvironment(input.message),
        area: "",
      });
    } catch (error) {
      console.error("Deterministic saveLead fallback error:", error);
    }
    return {
      reply: `Perfeito, ${maybeName}. Seus dados jÃ¡ foram cadastrados com sucesso. Para eu te indicar a melhor linha, qual ambiente vocÃª quer transformar?`,
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
          "\n\nRegras de resposta obrigatÃ³rias: nunca inventar produto/preÃ§o/prazo, manter continuidade com histÃ³rico e fazer apenas 1 pergunta por vez quando faltar contexto." +
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
            toolResults.push(`FunÃ§Ã£o nÃ£o suportada: ${call.name}`);
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
        "Estou aqui para te ajudar com pisos, rodapÃ©s, telhas e ripados. Me diga qual ambiente vocÃª quer transformar para eu te orientar no produto ideal.",
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

  app.get("/api/drive-image/:id", async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
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

      if (!message) {
        res.status(400).json({ ok: false, error: "Mensagem vazia" });
        return;
      }

      const result = await chatWithGemini({ message, history, customerContext });
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




