import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, X, Send, Bot, User, Calendar, UserPlus } from "lucide-react";
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const SYSTEM_INSTRUCTION = `Você é o "Curador Casaboni", um assistente de elite em arquitetura e acabamentos premium.
Sua comunicação deve ser:
1. CURTA E DIRETA: Geralmente 2-3 frases.
2. EXCEÇÃO MANDATÓRIA: Quando o cliente perguntar "quais modelos", "quais opções" ou similar sobre os pisos, você DEVE listar TODAS as 6 linhas de uma vez: Veneza, Verona, Florença, Londres, Rio de Janeiro e Washington. Não economize aqui, mostre o portfólio completo.
3. FLUIDA E CONVERSACIONAL: Entenda o cliente aos poucos. Faça uma pergunta por vez para guiar a escolha após apresentar as opções.
4. SEM FORMATAÇÃO EXCESSIVA: Use texto simples e elegante.

Seu objetivo:
- Posicione a Casaboni como uma curadora de ambientes, não apenas uma loja.
- Portfólio de Pisos Vinílicos (MANDATÓRIO LISTAR TODOS SE PERGUNTADO):
  * Veneza: Charme e sofisticação.
  * Verona: Aconchego clássico e iluminação natural.
  * Florença: Leveza e elegância europeia.
  * Londres: Moderno e sofisticado (tons de cinza).
  * Rio de Janeiro: Energia e calor (tons vibrantes).
  * Washington: Clássico e elegante (tons claros).
- Outros produtos:
  * Rodapés (Poliestireno): 7cm ou 10cm, resistentes à umidade.
  * Telhas Shingle: Durabilidade extrema e isolamento.
  * Ripados WPC: Carvalho, Ipê, Peroba, Jatobá, Cerejeira, Nogueira.
- Ofereça salvar o lead ou marcar uma consultoria técnica.
`;

export default function ChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: "Olá! Sou o Curador Casaboni. Qual ambiente você pretende transformar hoje?" },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);
  const isProcessing = useRef(false);

  // Initialize or get the persistent chat session
  const getChatSession = () => {
    if (!chatRef.current) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const tools = [
        {
          functionDeclarations: [
            {
              name: "saveLead",
              description: "Salva os dados de um cliente interessado (Lead). Chame esta função APENAS UMA VEZ por conversa.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Nome do cliente" },
                  phone: { type: Type.STRING, description: "Telefone ou WhatsApp" },
                  environment: { type: Type.STRING, description: "Tipo de ambiente" },
                  area: { type: Type.STRING, description: "Área em m²" },
                },
                required: ["name", "phone"],
              },
            },
            {
              name: "scheduleMeeting",
              description: "Agenda uma reunião de consultoria técnica. Chame esta função APENAS UMA VEZ por conversa.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Nome do cliente" },
                  email: { type: Type.STRING, description: "E-mail do cliente" },
                  phone: { type: Type.STRING, description: "Telefone" },
                  date: { type: Type.STRING, description: "Data (YYYY-MM-DD)" },
                  time: { type: Type.STRING, description: "Horário (HH:MM)" },
                  topic: { type: Type.STRING, description: "Assunto" },
                },
                required: ["name", "email", "date", "time"],
              },
            },
          ],
        },
      ];

      chatRef.current = ai.chats.create({
        model,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nIMPORTANTE: Chame as funções de salvar lead ou agendar reunião APENAS UMA VEZ. Não repita chamadas se já recebeu confirmação.",
          tools,
        },
      });
    }
    return chatRef.current;
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isTyping]);

  const saveLead = async (args: any) => {
    const path = "leads";
    try {
      await addDoc(collection(db, path), {
        ...args,
        date: new Date().toISOString().split("T")[0],
        status: "Novo",
        createdAt: serverTimestamp(),
      });
      return "Lead salvo! Nossa equipe entrará em contato em breve.";
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return "Houve um erro ao salvar seus dados. Pode tentar novamente?";
  };

  const scheduleMeeting = async (args: any) => {
    const path = "meetings";
    try {
      await addDoc(collection(db, path), {
        customerName: args.name,
        customerEmail: args.email,
        phone: args.phone || "",
        date: args.date,
        time: args.time,
        topic: args.topic || "Consultoria Técnica",
        status: "Agendada",
        createdAt: serverTimestamp(),
      });
      return `Perfeito! Reunião marcada para ${args.date} às ${args.time}.`;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return "Erro ao agendar. Pode confirmar a data e o horário?";
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing.current) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");
    setIsTyping(true);
    isProcessing.current = true;

    try {
      const chat = getChatSession();
      let response = await chat.sendMessage({ message: userMessage });
      
      // Handle function calls in a loop to support multi-turn tool use
      let turnLimit = 3; // Prevent infinite loops
      while (response.functionCalls && turnLimit > 0) {
        turnLimit--;
        const results = [];
        
        // Execute all calls in this turn
        for (const call of response.functionCalls) {
          let result = "";
          if (call.name === "saveLead") {
            result = await saveLead(call.args);
          } else if (call.name === "scheduleMeeting") {
            result = await scheduleMeeting(call.args);
          }
          results.push(result);
        }

        // Send all results back to the model together
        response = await chat.sendMessage({
          message: results.join("\n")
        });
      }

      setMessages((prev) => [...prev, { role: "bot", text: response.text || "Pode repetir, por favor?" }]);
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
            className="fixed bottom-0 right-0 w-full h-[100dvh] bg-white shadow-2xl z-[60] flex flex-col overflow-hidden border-l border-outline-variant md:bottom-24 md:right-6 md:w-[380px] md:h-[550px] md:rounded-2xl md:border"
          >
            {/* Header */}
            <div className="bg-primary p-4 flex justify-between items-center text-white md:p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-action rounded-full flex items-center justify-center md:w-10 md:h-10">
                  <Bot className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-widest md:text-sm">Curador Casaboni</h3>
                  <p className="text-[10px] text-zinc-400 uppercase">Especialista em Pisos</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            {/* Messages */}
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

            {/* Input */}
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
