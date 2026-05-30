import { GoogleGenAI } from "@google/genai";

type ChatMessage = { role: "user" | "bot"; text: string };
type CatalogEntry = { label: string; url: string };
type ProductCategory = "pisos" | "rodapes" | "telhas" | "ripados";

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
  return /preco|valor|orcamento|orçamento|quanto custa|preço/.test(normalizeText(text));
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
  const iso = text.match(/\b(\d{1,4})\s*(m2|m²|metros?)\b/i);
  if (iso) return `${iso[1]}m²`;
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

function buildMediaFromCatalog(entries: CatalogEntry[]) {
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
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
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
  const labels = (item: CatalogEntry) => normalizeText(item.label);

  for (const item of catalog) {
    const l = labels(item);
    if (category === "rodapes" && l.includes("rodape")) selected.push(item);
    if (category === "pisos" && models.some((m) => l.includes(m))) selected.push(item);
    if (category === "telhas" && (l.includes("telha") || l.includes("shingle") || l.includes("portfolio"))) selected.push(item);
    if (category === "ripados" && (l.includes("ripado") || l.includes("wpc") || l.includes("portfolio"))) selected.push(item);
  }

  const dedup = selected.filter((item, idx) => selected.findIndex((x) => x.url === item.url) === idx).slice(0, 6);
  if (!dedup.length) {
    return {
      reply: "Não encontrei fotos dessa categoria no Drive agora. Posso te apresentar alternativas próximas.",
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
      body: JSON.stringify({
        message,
        question: message,
        driveFolderId,
        customerContext: customerContext || "",
      }),
    });
    if (!response.ok) return { driveCatalog: [] as string[] };
    const data = await response.json();
    return { driveCatalog: Array.isArray(data?.driveCatalog) ? data.driveCatalog : [] };
  } catch {
    return { driveCatalog: [] as string[] };
  }
}

function contextFromHistory(history: ChatMessage[]) {
  const lastUser = history
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.text)
    .join(" ");
  return {
    category: detectCategory(lastUser),
    environment: extractEnvironment(lastUser),
    area: extractArea(lastUser),
  };
}

function buildGuidedReply(message: string, history: ChatMessage[]) {
  const historyCtx = contextFromHistory(history);
  const category = detectCategory(message) || historyCtx.category;
  const environment = extractEnvironment(message) || historyCtx.environment;
  const area = extractArea(message) || historyCtx.area;

  if (isGreeting(message)) {
    return "Olá! Sou o Consultor Casaboni. Posso te ajudar com pisos, rodapés, telhas ou ripados. Qual categoria você quer analisar primeiro?";
  }

  if (isPriceIntent(message) && !category) {
    return "Consigo te orientar com orçamento, sim. Primeiro me diga a categoria: pisos, rodapés, telhas ou ripados.";
  }

  if (category && !environment) {
    return `Perfeito. Para ${category}, qual ambiente você quer transformar?`;
  }

  if (category && environment && !area) {
    return `Ótimo, ${environment}. Qual a metragem aproximada em m² para eu te orientar com mais precisão?`;
  }

  if (category && environment && area) {
    return `Perfeito, para ${environment} com ${area}. Se quiser, já te mostro opções da linha ideal e em seguida te passo o próximo passo comercial.`;
  }

  return null;
}

function sanitizeReply(text: string) {
  const clean = String(text || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return "Pode repetir, por favor?";
  return clean.slice(0, 700);
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
      res.status(200).json({
        ok: true,
        reply: picked.reply,
        media: buildMediaFromCatalog(picked.selected),
      });
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
        reply:
          "Sou o Consultor Casaboni e estou aqui para te atender. Me diga o ambiente, metragem aproximada e categoria desejada para eu te orientar melhor.",
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
      },
      contents:
        [
          "Você é o Consultor Casaboni (vendas consultivas em ambientes).",
          "Regras obrigatórias:",
          "- Não invente produtos, preços, estoque, prazo ou políticas.",
          "- Se faltar dado, faça apenas 1 pergunta objetiva por vez.",
          "- Mantenha continuidade com o histórico e evite mudar de assunto.",
          "- Respostas curtas (até 3 frases), em pt-BR, tom profissional e amigável.",
          "- Antes de listar produtos, confirme categoria/ambiente/metragem.",
          "",
          "Catálogo disponível (somente referência real):",
          ragCatalogCompact || "- Catálogo não carregado nesta requisição.",
          "",
          conversation,
        ].join("\n"),
    });

    res.status(200).json({
      ok: true,
      reply: sanitizeReply(response.text),
      media: [],
    });
  } catch {
    const message = String(req.body?.message || "").trim();
    const fallbackReply = message
      ? "Estou aqui para te ajudar com a escolha do produto ideal. Me diga ambiente, metragem e categoria."
      : "Posso te ajudar com pisos, rodapés, telhas e ripados. Como posso te atender?";
    res.status(200).json({
      ok: true,
      reply: fallbackReply,
      media: [],
    });
  }
}

