import { GoogleGenAI } from "@google/genai";

type ChatMessage = { role: "user" | "bot"; text: string };
type CatalogEntry = { label: string; url: string };

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPhotoIntent(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("foto") ||
    normalized.includes("imagem") ||
    normalized.includes("catalogo") ||
    normalized.includes("portifolio") ||
    normalized.includes("portfolio")
  );
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

  const wantsPisos = normalized.includes("piso") || normalized.includes("vinil");
  const wantsRodape = normalized.includes("rodape");
  const wantsTelha = normalized.includes("telha") || normalized.includes("shingle");
  const wantsRipado = normalized.includes("ripado") || normalized.includes("wpc");

  const selected: CatalogEntry[] = [];
  for (const item of catalog) {
    const label = normalizeText(item.label);
    if (wantsRodape && label.includes("rodape")) selected.push(item);
    if (wantsPisos && models.some((m) => label.includes(m))) selected.push(item);
    if (wantsTelha && (label.includes("telha") || label.includes("shingle") || label.includes("portfolio"))) selected.push(item);
    if (wantsRipado && (label.includes("ripado") || label.includes("wpc") || label.includes("portfolio"))) selected.push(item);
  }

  const dedup = selected.filter((item, idx) => selected.findIndex((s) => s.url === item.url) === idx).slice(0, 6);
  if (dedup.length) {
    return { reply: "Perfeito! Separei as fotos do produto que você pediu.", selected: dedup };
  }

  return {
    reply: "Tenho fotos de pisos, rodapés, telhas shingle e ripados. Qual produto você quer ver primeiro?",
    selected: [],
  };
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

    const key = (process.env.GEMINI_API_KEY || "").trim();
    if (!key) {
      res.status(200).json({
        ok: true,
        reply:
          "Sou o Consultor Casaboni e estou aqui para te atender. Me diga o ambiente, metragem aproximada e produto de interesse para eu te orientar melhor.",
        media: [],
      });
      return;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    const conversation = history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Cliente" : "Consultor"}: ${m.text}`)
      .concat(`Cliente: ${message}`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
      contents:
        "Você é o Consultor Casaboni, consultor de vendas online. Responda em português, com objetividade e tom comercial.\n\n" +
        conversation,
    });

    res.status(200).json({ ok: true, reply: String(response.text || "Pode repetir, por favor?"), media: [] });
  } catch (error) {
    const message = String(req.body?.message || "").trim();
    const fallbackReply = message
      ? "Estou aqui para te ajudar com a escolha do produto ideal. Me diga ambiente e metragem aproximada."
      : "Posso te ajudar com pisos, rodapés, telhas e ripados. Como posso te atender?";
    res.status(200).json({
      ok: true,
      reply: fallbackReply,
      media: [],
    });
  }
}
