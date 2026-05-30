import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { addDoc, collection, getFirestore, serverTimestamp } from "firebase/firestore";

type ChatMessage = { role: "user" | "bot"; text: string };
type ProductCategory = "pisos" | "rodapes" | "telhas" | "ripados";
type CatalogEntry = { label: string; url: string };
type ChatMedia = { id: string; label: string; sourceUrl: string; thumbnailUrl: string };

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
  if (n.includes("escritorio")) return "Escritório";
  if (n.includes("banheiro")) return "Banheiro";
  if (n.includes("area gourmet")) return "Área Gourmet";
  if (n.includes("comercial")) return "Comercial";
  return "";
}

function extractArea(text: string) {
  const normalized = normalizeText(text).trim();
  const directNumber = normalized.match(/^(\d{1,4})([.,]\d{1,2})?$/);
  if (directNumber) return `${directNumber[1]}m²`;

  const match = normalized.match(/\b(\d{1,4})([.,]\d{1,2})?\s*(m2|m²|m|metros?|metro)\b/i);
  if (!match) return "";
  return `${match[1]}m²`;
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
  const patterns = [
    /meu nome[^a-zA-Z0-9]{0,8}\s*([\p{L}'\s]{3,80})/iu,
    /\bnome\s*[:\-]\s*([\p{L}'\s]{3,80})/iu,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const cleaned = match[1]
      .split(/\b(?:whatsapp|telefone|celular|email|data|horario|às|as|e meu|meu)\b/i)[0]
      .replace(/[,.!?]+$/g, "")
      .trim();

    if (cleaned.length >= 3) return cleaned;
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

function pickCatalogByIntent(message: string, catalog: CatalogEntry[]) {
  const normalized = normalizeText(message);
  const models = ["veneza", "verona", "florenca", "londres", "rio de janeiro", "washington"];

  const matchedModel = models.find((m) => normalized.includes(m));
  if (matchedModel) {
    const selected = catalog.filter((c) => normalizeText(c.label).includes(matchedModel));
    if (selected.length) {
      return { reply: `Perfeito! Separei as fotos da linha ${matchedModel}.`, selected };
    }
  }

  const category = detectCategory(message);
  if (!category) {
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
  if (!webhook || !driveFolderId) return { driveCatalog: [] as string[] };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, question: message, driveFolderId, customerContext: customerContext || "" }),
    });
    if (!response.ok) return { driveCatalog: [] as string[] };
    const data = await response.json();
    return { driveCatalog: Array.isArray(data?.driveCatalog) ? data.driveCatalog : [] };
  } catch {
    return { driveCatalog: [] as string[] };
  }
}

function contextFromHistory(history: ChatMessage[]) {
  const lastUserText = history
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.text)
    .join(" ");

  return {
    category: detectCategory(lastUserText),
    environment: extractEnvironment(lastUserText),
    area: extractArea(lastUserText),
    greeted: history.some((m) => m.role === "bot" && normalizeText(m.text).includes("sou o consultor casaboni")),
  };
}

function buildGuidedReply(message: string, history: ChatMessage[]) {
  const historyCtx = contextFromHistory(history);
  const category = detectCategory(message) || historyCtx.category;
  const environment = extractEnvironment(message) || historyCtx.environment;
  const area = extractArea(message) || historyCtx.area;

  if (isGreeting(message)) {
    if (historyCtx.greeted) {
      if (!category) return "Perfeito. Para eu te atender melhor, você quer ver pisos, rodapés, telhas ou ripados?";
      if (!environment) return `Perfeito. Para ${category}, qual ambiente você quer transformar?`;
      if (!area) return `Ótimo, ${environment}. Qual a metragem aproximada em m² para eu te orientar com mais precisão?`;
      return "Perfeito. Me diga o próximo detalhe que você quer analisar e eu te ajudo a decidir.";
    }
    return "Olá! Sou o Consultor Casaboni. Posso te ajudar com pisos, rodapés, telhas ou ripados. Qual categoria você quer analisar primeiro?";
  }

  if (isPriceIntent(message) && !category) {
    return "Consigo te orientar com orçamento, sim. Primeiro me diga a categoria: pisos, rodapés, telhas ou ripados.";
  }

  if (category && !environment) return `Perfeito. Para ${category}, qual ambiente você quer transformar?`;
  if (category && environment && !area) return `Ótimo, ${environment}. Qual a metragem aproximada em m² para eu te orientar com mais precisão?`;
  if (category && environment && area) return `Perfeito, para ${environment} com ${area}. Se quiser, já te mostro a linha ideal para esse contexto.`;

  return null;
}

function sanitizeReply(text: string) {
  const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return "Pode repetir, por favor?";
  return clean.slice(0, 700);
}

async function saveLead(args: { name: string; phone: string; environment?: string; area?: string }) {
  if (!db) return false;
  await addDoc(collection(db, "leads"), {
    name: args.name,
    phone: args.phone,
    environment: args.environment || "",
    area: args.area || "",
    date: new Date().toISOString().slice(0, 10),
    status: "Novo",
    source: "chat-agent-api",
    createdAt: serverTimestamp(),
  });
  return true;
}

async function scheduleMeeting(args: { name: string; email: string; phone?: string; date: string; time: string; topic?: string }) {
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

    if (!message) {
      res.status(400).json({ ok: false, error: "Mensagem vazia" });
      return;
    }

    const rag = await fetchRagContext(message, customerContext);
    const catalog = parseCatalogEntries(rag.driveCatalog);

    if (isPhotoIntent(message)) {
      const picked = pickCatalogByIntent(message, catalog);
      res.status(200).json({ ok: true, reply: picked.reply, media: buildMediaFromCatalog(picked.selected) });
      return;
    }

    const maybeName = extractName(message);
    const maybePhone = extractPhone(message);
    const maybeEmail = extractEmail(message);
    const maybeDate = extractDate(message);
    const maybeTime = extractTime(message);

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
      try {
        await saveLead({ name: maybeName, phone: maybePhone, environment: extractEnvironment(message), area: extractArea(message) });
      } catch {}
      res.status(200).json({
        ok: true,
        reply: `Perfeito, ${maybeName}. Seus dados já foram cadastrados. Agora me diga o ambiente e a metragem para eu indicar a melhor linha.`,
        media: [],
      });
      return;
    }

    if ((hasLeadIntent(message) || maybePhone) && (!maybeName || !maybePhone)) {
      const missingLead = !maybeName ? "nome completo" : "telefone/WhatsApp";
      res.status(200).json({ ok: true, reply: `Perfeito, posso cadastrar seu contato. Me informe seu ${missingLead}.`, media: [] });
      return;
    }

    const guided = buildGuidedReply(message, history);
    if (guided) {
      res.status(200).json({ ok: true, reply: guided, media: [] });
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
        "- Antes de listar produtos, confirme categoria/ambiente/metragem.",
        "- Produtos Casaboni: pisos, rodapés, telhas shingle e ripados.",
        "",
        "Catálogo disponível:",
        ragCatalogCompact || "- Catálogo não carregado nesta requisição.",
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

    res.status(200).json({ ok: true, reply: sanitizeReply(response.text), media: [] });
  } catch {
    const message = String(req.body?.message || "").trim();
    const fallbackReply = message
      ? "Estou aqui para te ajudar com a escolha do produto ideal. Me diga ambiente, metragem e categoria."
      : "Posso te ajudar com pisos, rodapés, telhas e ripados. Como posso te atender?";

    res.status(200).json({ ok: true, reply: fallbackReply, media: [] });
  }
}