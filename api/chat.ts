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

function isGreeting(text: string) {
  const n = normalizeText(text).trim();
  const short = n.split(/\s+/).length <= 3;
  return short && /^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hello)$/.test(n);
}

function isPhotoIntent(text: string) {
  const n = normalizeText(text);
  return (
    n.includes("foto") ||
    n.includes("imagem") ||
    n.includes("catalogo") ||
    n.includes("portfolio") ||
    n.includes("portifolio")
  );
}

function isPriceIntent(text: string) {
  return /preco|valor|orcamento|quanto custa/.test(normalizeText(text));
}

function hasMeetingIntent(text: string) {
  return /agendar|reuniao|consultoria/.test(normalizeText(text));
}

function hasLeadIntent(text: string) {
  return /salvar|cadastro|cadastrar|contato|whatsapp/.test(normalizeText(text));
}

function hasFrustrationIntent(text: string) {
  const n = normalizeText(text);
  return /nao entende|nao entendeu|nao entende nada|errado|nada a ver|burro|burra|repetindo|voce nao entende|vc nao entende/.test(n);
}

function hasExplorationIntent(text: string) {
  const n = normalizeText(text);
  const raw = text.toLowerCase();
  return (
    /nao sei bem|nao sei o que|nao sei escolher|estou em duvida|to em duvida|indecis|so olhando|sugestoes|ideias|me ajuda a escolher/.test(
      n
    ) || /n.o sei bem|n.o sei o que|n.o sei escolher|duvid/.test(raw)
  );
}

function hasUnknownAreaIntent(text: string) {
  const n = normalizeText(text);
  const raw = text.toLowerCase();
  const mentionsAreaContext =
    /metragem|medida|area|m2|m\u00b2|metro/.test(n) || /\b\d+\s*m(?:2|\u00b2)?\b/i.test(raw);
  return (
    /sem metragem|sem medida/.test(n) ||
    (/nao lembro|nao sei|sem ideia|nao tenho ideia|nao tenho certeza|nao recordo|nao faco ideia/.test(n) &&
      mentionsAreaContext) ||
    (/n.o lembro|n.o sei|n.o tenho certeza|n.o recordo/.test(raw) && mentionsAreaContext)
  );
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

function hasPositiveChoiceIntent(text: string) {
  const n = normalizeText(text);
  return /gostei|curti|amei|prefiro|quero esse|quero essa|esse mesmo|essa mesmo|ficou bom|me agradou/.test(n);
}

function hasQuoteIntent(text: string) {
  const n = normalizeText(text);
  return isPriceIntent(text) || /orcamento|orçamento|orc|proposta|comprar|fechar|pedido|quanto fica|me passa valor|quero simular/.test(n);
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
  if (!hasCategoryMention(message) || history.length === 0) return false;

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

  return (
    normalizedBot.includes("qual produto voce quer ver primeiro") ||
    normalizedBot.includes("tenho fotos de pisos") ||
    normalizedBot.includes("separo por categoria") ||
    isPhotoIntent(recentUserText)
  );
}

function pickCatalogByIntent(message: string, catalog: CatalogEntry[]) {
  const normalized = normalizeText(message);
  const models = ["veneza", "verona", "florenca", "londres", "rio de janeiro", "washington"];
  const wantsPortfolio = /portfolio|portifolio|catalogo|inspiracao|inspirar/.test(normalized);

  const matchedModel = models.find((m) => normalized.includes(m));
  if (matchedModel) {
    const selected = catalog.filter((c) => normalizeText(c.label).includes(matchedModel));
    if (selected.length) {
      return { reply: `Perfeito! Separei as fotos da linha ${matchedModel}.`, selected };
    }
  }

  const category = detectCategory(message);
  if (!category) {
    if (wantsPortfolio) {
      const selected = catalog
        .filter((item) => {
          const label = normalizeText(item.label);
          return models.some((m) => label.includes(m)) || label.includes("rodape");
        })
        .slice(0, 6);

      return {
        reply:
          selected.length > 0
            ? "Claro. Separei um recorte visual do portfólio para você folhear primeiro. Depois me diga qual ambiente você quer renovar."
            : "Claro. Posso te guiar pelo portfólio; hoje temos pisos, rodapés, telhas shingle e ripados. Qual ambiente você quer renovar?",
        selected,
      };
    }

    return {
      reply: "Tenho fotos de pisos, rodapés, telhas shingle e ripados. Qual produto você quer ver primeiro?",
      selected: [],
    };
  }

  const selected: CatalogEntry[] = [];
  const label = (item: CatalogEntry) => normalizeText(item.label);

  for (const item of catalog) {
    const n = label(item);
    if (category === "rodapes" && n.includes("rodape")) selected.push(item);
    if (category === "pisos" && models.some((m) => n.includes(m))) selected.push(item);
    if (category === "telhas" && (n.includes("telha") || n.includes("shingle") || n.includes("portfolio"))) {
      selected.push(item);
    }
    if (category === "ripados" && (n.includes("ripado") || n.includes("wpc") || n.includes("portfolio"))) {
      selected.push(item);
    }
  }

  const dedup = selected.filter((item, idx) => selected.findIndex((x) => x.url === item.url) === idx).slice(0, 6);
  if (!dedup.length) {
    return {
      reply: "Não encontrei fotos dessa categoria no Drive agora. Posso te orientar por outra linha semelhante.",
      selected: [],
    };
  }

  return { reply: "Perfeito! Separei as fotos do produto que você pediu.", selected: dedup };
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

function contextFromHistory(history: ChatMessage[]) {
  const userTexts = history
    .filter((m) => m.role === "user")
    .slice(-8)
    .map((m) => m.text);
  const lastUserText = userTexts.join(" ");
  const lastBotText = history
    .filter((m) => m.role === "bot")
    .slice(-3)
    .map((m) => m.text)
    .join(" ");
  const latestFromUserHistory = (extractor: (text: string) => string) =>
    [...userTexts].reverse().map(extractor).find(Boolean) || "";
  const environments = extractEnvironments(lastUserText);

  return {
    category: detectCategory(lastUserText),
    environment: latestFromUserHistory(extractEnvironment) || environments[0] || "",
    environments,
    propertyType: latestFromUserHistory(extractPropertyType) || extractPropertyType(lastUserText),
    area: latestFromUserHistory(extractArea) || extractArea(lastUserText),
    areaBand: latestFromUserHistory(extractAreaBand) || extractAreaBand(lastUserText),
    style: latestFromUserHistory(extractStyle) || extractStyle(lastUserText),
    botAskedArea: /metragem|m\u00b2|m2/.test(normalizeText(lastBotText)),
    botEnvironment: extractEnvironment(lastBotText),
    greeted: history.some(
      (m) => m.role === "bot" && normalizeText(m.text).includes("sou o consultor casaboni")
    ),
  };
}

function buildGuidedReply(message: string, history: ChatMessage[]) {
  const historyCtx = contextFromHistory(history);
  const category = detectCategory(message) || historyCtx.category;
  const environment = extractEnvironment(message) || historyCtx.environment || historyCtx.botEnvironment;
  const propertyType = extractPropertyType(message) || historyCtx.propertyType;
  const area = extractArea(message) || historyCtx.area;
  const areaBand = extractAreaBand(message) || historyCtx.areaBand;
  const style = extractStyle(message) || historyCtx.style;
  const currentEnvironments = extractEnvironments(message);
  const environments = currentEnvironments.length ? currentEnvironments : historyCtx.environments;
  const areaNumber = parseAreaNumber(area);
  const likelyAreaTypingMistake =
    !!area &&
    areaNumber > 0 &&
    areaNumber < 10 &&
    /(sala|quarto|cozinha|comercial|apartamento|casa)/.test(normalizeText(environment || message));

  if (isGreeting(message)) {
    if (historyCtx.greeted) {
      if (!category) return "Perfeito. Para eu te atender melhor, você quer ver pisos, rodapés, telhas ou ripados?";
      if (!environment) return `Perfeito. Para ${category}, qual ambiente você quer transformar?`;
      if (!area) return "Sem problema se você não tiver a metragem exata. Podemos seguir por faixa: pequeno, médio ou grande.";
      return "Perfeito. Me diga o próximo detalhe que você quer analisar e eu te ajudo a decidir.";
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

  if (isPriceIntent(message) && !category) {
    return "Consigo te orientar com orçamento, sim. Primeiro me diga a categoria: pisos, rodapés, telhas ou ripados.";
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

  if (hasUnknownAreaIntent(message) && (historyCtx.botAskedArea || (category && environment && !area))) {
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

  if (category && !environment) return `Perfeito. Para ${category}, qual ambiente você quer transformar?`;
  if (category && environment && !area) {
    if (areaBand) {
      const bandLabel = areaBand === "medio" ? "médio" : areaBand;
      if (!style) {
        return `Perfeito, ${environment} de porte ${bandLabel}. Você prefere um visual mais claro, amadeirado, moderno ou rústico?`;
      }
      return `Excelente. Para ${environment} de porte ${bandLabel} e estilo ${style}, já consigo separar opções mais alinhadas para você.`;
    }
    if (hasUnknownAreaIntent(message)) {
      return "Sem problema. Podemos começar sem metragem exata. Me diga se o ambiente é pequeno, médio ou grande que eu já te indico opções mais assertivas.";
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
    return `Excelente. Para ${environment} com ${area} e estilo ${style}, já consigo separar opções mais alinhadas para você.`;
  }

  return null;
}
function sanitizeReply(text: string) {
  const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return "Pode repetir, por favor?";
  return clean.slice(0, 700);
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

  if (adminDb) {
    if (payload.sessionId) {
      const existing = await adminDb.collection("leads").where("sessionId", "==", payload.sessionId).limit(1).get();
      if (!existing.empty) {
        await existing.docs[0].ref.update({
          ...payload,
          updatedAt: new Date(),
        });
        return true;
      }
    }

    await adminDb.collection("leads").add({
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return true;
  }

  if (!db) return false;

  // Public Firestore rules allow lead creation, but not public reads.
  // Without Admin credentials, create directly instead of querying by session.
  await addDoc(collection(db, "leads"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return true;
}

async function scheduleMeeting(args: { name: string; email: string; phone?: string; date: string; time: string; topic?: string }) {
  const adminDb = getAdminDb();
  if (adminDb) {
    await adminDb.collection("meetings").add({
      customerName: args.name,
      customerEmail: args.email,
      phone: args.phone || "",
      date: args.date,
      time: args.time,
      topic: args.topic || "Consultoria T\u00e9cnica",
      status: "Agendada",
      source: "chat-agent-api",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return true;
  }

  if (!db) return false;
  await addDoc(collection(db, "meetings"), {
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
  return true;
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

    const rag = await fetchRagContext(message, customerContext);
    const catalog = parseCatalogEntries(rag.driveCatalog);
    const photoFlow = isPhotoIntent(message) || isPhotoFollowUpSelection(history, message);

    if (photoFlow) {
      const picked = pickCatalogByIntent(message, catalog);
      res.status(200).json({
        ok: true,
        reply: picked.reply,
        media: buildMediaFromCatalog(picked.selected),
        source: "photo-flow",
      });
      return;
    }

    const maybeName = extractName(message);
    const maybePhone = extractPhone(message);
    const maybeEmail = extractEmail(message);
    const maybeDate = extractDate(message);
    const maybeTime = extractTime(message);
    const leadProfile = buildLeadProfile(history, message, sessionId);

    if (hasMeetingIntent(message) && maybeName && maybeEmail && maybeDate && maybeTime) {
      try {
        await scheduleMeeting({ name: maybeName, email: maybeEmail, phone: maybePhone, date: maybeDate, time: maybeTime });
      } catch {}
      res.status(200).json({
        ok: true,
        reply: `Perfeito, ${maybeName}. Reunião agendada para ${maybeDate} às ${maybeTime}. Se quiser, já me diga o ambiente e a metragem para adiantarmos a consultoria.`,
        media: [],
      });
      return;
    }

    if (hasMeetingIntent(message) && (!maybeName || !maybeEmail || !maybeDate || !maybeTime)) {
      const missing: string[] = [];
      if (!maybeName) missing.push("nome");
      if (!maybeEmail) missing.push("email");
      if (!maybeDate) missing.push("data (YYYY-MM-DD)");
      if (!maybeTime) missing.push("horário (HH:MM)");
      res.status(200).json({ ok: true, reply: `Perfeito, eu agendo para você. Me confirme: ${missing.join(", ")}.`, media: [] });
      return;
    }

    if ((hasLeadIntent(message) || maybePhone) && maybeName && maybePhone) {
      let leadSaved = false;
      try {
        await saveLead({
          ...leadProfile,
          name: maybeName,
          phone: maybePhone,
          environment: leadProfile.environment || extractEnvironment(message),
          area: leadProfile.area || extractArea(message),
        });
        leadSaved = true;
      } catch (error) {
        console.error("Lead save error:", error);
      }
      res.status(200).json({
        ok: true,
        reply: leadProfile.city
          ? `Perfeito, ${maybeName}. Seus dados j\u00e1 foram cadastrados. Quer que eu encaminhe o pr\u00f3ximo passo de or\u00e7amento pelo WhatsApp?`
          : `Perfeito, ${maybeName}. Seus dados j\u00e1 foram cadastrados. De qual cidade voc\u00ea fala? Assim eu direciono melhor disponibilidade e pr\u00f3ximo passo.`,
        media: [],
        source: "lead-flow",
        leadSaved,
      });
      return;
    }

    if ((hasLeadIntent(message) || maybePhone) && (!maybeName || !maybePhone)) {
      const missingLead = !maybeName ? "nome completo" : "telefone/WhatsApp";
      res.status(200).json({ ok: true, reply: `Perfeito, posso cadastrar seu contato. Me informe seu ${missingLead}.`, media: [], source: "lead-flow" });
      return;
    }

    if (leadProfile.name && leadProfile.phone) {
      try {
        await saveLead(leadProfile);
      } catch {}
    }

    const commercial = buildCommercialReply(message, history, leadProfile);
    if (commercial) {
      res.status(200).json({ ok: true, reply: commercial, media: [], source: "commercial-flow" });
      return;
    }

    const guided = buildGuidedReply(message, history);
    if (guided) {
      res.status(200).json({ ok: true, reply: guided, media: [], source: "guided-flow" });
      return;
    }

    const key = (process.env.GEMINI_API_KEY || "").trim();
    if (!key) {
      res.status(200).json({
        ok: true,
        reply: "Sou o Consultor Casaboni e estou aqui para te atender. Me diga o ambiente, metragem aproximada e categoria desejada para eu te orientar melhor.",
        media: [],
      });
      return;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    const conversation = history
      .slice(-10)
      .map((m) => `${m.role === "user" ? "Cliente" : "Consultor"}: ${m.text}`)
      .concat(`Cliente: ${message}`)
      .join("\n");

    const ragCatalogCompact = catalog.slice(0, 20).map((c) => `- ${c.label}`).join("\n");
    const ragPromptContext = String(rag.ragPromptContext || "").slice(0, 12000);
    const ragHints = Array.isArray(rag.systemHints) ? rag.systemHints.slice(0, 20) : [];
    const response = await ai.models.generateContent({
      model: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
      config: {
        temperature: 0.2,
        maxOutputTokens: 280,
        tools: [
          {
            functionDeclarations: [
              {
                name: "saveLead",
                description: "Salvar lead quando nome e telefone forem confirmados",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    environment: { type: Type.STRING },
                    area: { type: Type.STRING },
                  },
                  required: ["name", "phone"],
                },
              },
              {
                name: "scheduleMeeting",
                description: "Agendar reunião quando nome, email, data e horário forem confirmados",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    date: { type: Type.STRING },
                    time: { type: Type.STRING },
                    topic: { type: Type.STRING },
                  },
                  required: ["name", "email", "date", "time"],
                },
              },
            ],
          },
        ],
      },
      contents: [
        "Você é o Consultor Casaboni (vendas consultivas em ambientes).",
        "Regras obrigatórias:",
        "- Não invente produtos, preços, estoque, prazos ou políticas.",
        "- Se faltar dado, faça apenas 1 pergunta objetiva por vez.",
        "- Mantenha continuidade com o histórico e evite mudar de assunto.",
        "- Respostas curtas (até 3 frases), em pt-BR, tom profissional e amigável.",
        "- Se o cliente estiver indeciso, acolha e converse antes de qualificar (ex.: casa/apartamento, estilo de vida, ambiente de maior uso).",
        "- Ofereça opcionalmente um resumo do portfólio antes de pedir muitos dados técnicos.",
        "- Se o cliente não souber metragem, ofereça alternativa por faixa (pequeno/médio/grande).",
        "- Antes de listar produtos, confirme categoria, ambiente e estilo.",
        "- Produtos Casaboni: pisos, rodapés, telhas shingle e ripados.",
        "",
        "Catálogo disponível:",
        ragCatalogCompact || "- Catálogo não carregado nesta requisição.",
        "",
        rag.playbookLoaded
          ? "Manual oficial do consultor carregado do Drive nesta requisição."
          : "Manual oficial do consultor não carregado nesta requisição.",
        ragHints.length ? `Diretrizes RAG resumidas:\n${ragHints.map((h) => `- ${h}`).join("\n")}` : "",
        ragPromptContext ? `Contexto RAG completo:\n${ragPromptContext}` : "",
        "",
        conversation,
      ].join("\n"),
    });

    if (response.functionCalls?.length) {
      for (const call of response.functionCalls) {
        if (call.name === "saveLead") {
          const args = (call.args || {}) as { name: string; phone: string; environment?: string; area?: string };
          if (args.name && args.phone) {
            try { await saveLead(args); } catch {}
          }
        }

        if (call.name === "scheduleMeeting") {
          const args = (call.args || {}) as { name: string; email: string; phone?: string; date: string; time: string; topic?: string };
          if (args.name && args.email && args.date && args.time) {
            try { await scheduleMeeting(args); } catch {}
          }
        }
      }
    }

    res.status(200).json({ ok: true, reply: sanitizeReply(response.text), media: [], source: "gemini" });
  } catch {
    const message = String(req.body?.message || "").trim();
    const exploratoryFallback = hasExplorationIntent(message);
    const fallbackReply = message
      ? exploratoryFallback
        ? "Perfeito, eu te ajudo com calma. Se quiser, começamos com uma visão rápida do portfólio; me diz só se é casa ou apartamento."
        : "Estou aqui para te atender e te ajudar a escolher o produto ideal. Qual ambiente você quer renovar primeiro?"
      : "Posso te ajudar com pisos, rodapés, telhas e ripados. Como posso te atender?";

    res.status(200).json({ ok: true, reply: fallbackReply, media: [], source: "fallback-error" });
  }
}
