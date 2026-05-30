import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Send, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import BrandLogo from "./BrandLogo";

type DriveImagePreview = {
  id: string;
  sourceUrl: string;
  thumbnailUrl: string;
  label: string;
};

type ChatMessageView = {
  role: "user" | "bot";
  text: string;
  media?: DriveImagePreview[];
};

const CONSULTANT_AVATAR = "/consultor-casaboni.png";

function getBrazilGreeting() {
  const hourText = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const hour = Number(hourText);

  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  if (hour >= 0 && hour < 5) return "Boa madrugada";
  return "Boa noite";
}

function buildOpeningMessage() {
  const greeting = getBrazilGreeting();
  return `${greeting}! Sou o Consultor Casaboni. Estou aqui para te atender e te ajudar a sair satisfeito com o atendimento. Qual ambiente você quer transformar hoje?`;
}

function stripDriveLinks(text: string) {
  return text
    .replace(/\n?https?:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/view[^\s]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDriveImagePreviews(text: string): DriveImagePreview[] {
  const previews: DriveImagePreview[] = [];
  const seenIds = new Set<string>();
  const lines = text.split(/\r?\n/);
  let pendingLabel = "";

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    const hasImageLabel = /\.(jpg|jpeg|png|webp|gif)\b/i.test(line);
    if (hasImageLabel) {
      pendingLabel = line.replace(/^-+\s*/, "").trim();
    }

    const urlMatch = line.match(/https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view[^\s]*/i);
    if (!urlMatch) continue;

    const id = urlMatch[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const inlineLabel = line
      .replace(/^-+\s*/, "")
      .replace(/\s*-\s*https?:\/\/drive\.google\.com\/file\/d\/[^\s]+/i, "")
      .trim();

    const label = (pendingLabel || inlineLabel || "Imagem do catálogo").replace(/^\d+\.\s*/, "").trim();
    pendingLabel = "";

    previews.push({
      id,
      sourceUrl: urlMatch[0],
      thumbnailUrl: `/api/drive-image/${id}`,
      label,
    });
  }

  return previews;
}

export default function ChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[]>(() => [
    { role: "bot", text: buildOpeningMessage() },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProcessing = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsOpen(true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing.current) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");
    setIsTyping(true);
    isProcessing.current = true;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const reply = data?.reply || "Pode repetir, por favor?";
      const media = Array.isArray(data?.media)
        ? data.media.map((m: any) => ({
            id: String(m.id || ""),
            sourceUrl: String(m.sourceUrl || ""),
            thumbnailUrl: String(m.thumbnailUrl || ""),
            label: String(m.label || "Imagem do catálogo"),
          }))
            .filter((m: DriveImagePreview) => m.id && m.thumbnailUrl)
        : [];
      const safeReply = media.length > 0 ? stripDriveLinks(reply) : reply;
      setMessages((prev) => [...prev, { role: "bot", text: safeReply, media }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [...prev, { role: "bot", text: "Tive um pequeno problema técnico. Pode me chamar no WhatsApp se preferir!" }]);
    } finally {
      setIsTyping(false);
      isProcessing.current = false;
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-action text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:scale-110 transition-transform md:w-16 md:h-16"
      >
        <MessageSquare className="w-7 h-7 md:w-8 md:h-8" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 right-4 left-4 h-[72dvh] max-h-[620px] bg-white shadow-2xl z-[60] flex flex-col overflow-hidden border border-outline-variant rounded-2xl md:bottom-24 md:right-6 md:left-auto md:w-[380px] md:h-[550px]"
          >
            <div className="bg-primary p-4 flex justify-between items-center text-white md:p-5">
              <div className="flex items-center gap-3">
                <img
                  src={CONSULTANT_AVATAR}
                  alt="Consultor Casaboni"
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border-2 border-white/50 shadow-lg"
                  referrerPolicy="no-referrer"
                />
                <BrandLogo subtitle="Consultor de Vendas" light compact className="scale-[0.86] origin-left" />
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-low md:p-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-3 text-sm leading-relaxed md:max-w-[80%] md:p-4 ${
                    msg.role === "user"
                      ? "bg-action text-white rounded-2xl rounded-tr-none"
                      : "bg-white text-primary border border-outline-variant rounded-2xl rounded-tl-none shadow-sm"
                  }`}>
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                    {msg.role === "bot" && (() => {
                      const previews = msg.media && msg.media.length > 0
                        ? msg.media
                        : extractDriveImagePreviews(msg.text);
                      if (previews.length === 0) return null;
                      return (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {previews.map((img) => (
                            <div
                              key={img.id}
                              className="block rounded-lg overflow-hidden border border-outline-variant bg-surface-low"
                              title={img.label}
                            >
                              <img
                                src={img.thumbnailUrl}
                                alt={img.label}
                                className="w-full h-24 object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (!target.dataset.fallbackTried) {
                                    target.dataset.fallbackTried = "1";
                                    target.src = `/api/drive-image/${img.id}?mode=thumb`;
                                  }
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-outline-variant p-3 rounded-2xl rounded-tl-none flex gap-1 shadow-sm">
                    <span className="w-1 h-1 bg-outline rounded-full animate-bounce"></span>
                    <span className="w-1 h-1 bg-outline rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1 h-1 bg-outline rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-outline-variant bg-white safe-bottom">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Sua mensagem..."
                  className="flex-1 bg-surface-low border border-outline-variant px-4 py-2.5 text-sm focus:outline-none focus:border-action rounded-full"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="bg-primary text-white p-2.5 rounded-full hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

