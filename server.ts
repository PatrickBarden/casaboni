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
    normalized.includes("catálogo") ||
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
4. Se o cliente pedir fotos/imagens/catálogo, nunca despejar todo o catálogo; primeiro entender a categoria desejada e enviar apenas o que for relevante.
5. Nunca limitar atendimento apenas a pisos.
6. Falar sempre em portugues do Brasil (pt-BR) e considerar horario de Brasilia (America/Sao_Paulo) para saudacoes.

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
  const patterns = [
    /meu nome(?:\s+e|\s+é)?\s*[:\-]?\s*([\p{L}'\s]{3,80})/iu,
    /nome\s*[:\-]\s*([\p{L}'\s]{3,80})/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return match[1].split(/[,.!?\n]/)[0].trim();
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

function hasMeetingIntent(text: string) {
  return /agendar|reuniao|reunião|consultoria/.test(text.toLowerCase());
}

function hasLeadIntent(text: string) {
  return /salvar|cadastro|cadastrar|contato|whatsapp/.test(text.toLowerCase());
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY ausente no servidor");
  }

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
    await scheduleMeeting({
      name: maybeName,
      email: maybeEmail,
      phone: maybePhone,
      date: maybeDate,
      time: maybeTime,
      topic: "Consultoria Técnica",
    });
    return {
      reply: `Perfeito, ${maybeName}. Reunião agendada para ${maybeDate} às ${maybeTime}. Se quiser, já me diga o ambiente e a metragem para adiantarmos a consultoria.`,
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  if (hasLeadIntent(input.message) && maybeName && maybePhone) {
    await saveLead({
      name: maybeName,
      phone: maybePhone,
      environment: extractEnvironment(input.message),
      area: "",
    });
    return {
      reply: `Perfeito, ${maybeName}. Seus dados já foram cadastrados com sucesso. Para eu te indicar a melhor linha, qual ambiente você quer transformar?`,
      rag: {
        filesFound: ragContext.filesFound,
        driveCatalog: ragContext.driveCatalog,
      },
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const chat = ai.chats.create({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      config: {
        systemInstruction:
          BASE_SYSTEM_INSTRUCTION +
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
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
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




