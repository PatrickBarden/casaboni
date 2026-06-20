import { FormEvent, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
  CalendarDays,
  CheckCircle2,
  Hammer,
  Home,
  MoreHorizontal,
  PhoneCall,
  ShieldCheck,
  Video,
} from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";

type FunnelStep = 1 | 2 | 3 | 4 | 5 | 6;

type DateOption = {
  iso: string;
  label: string;
  weekday: string;
};

type QuoteFunnelState = {
  projectType: string;
  environmentType: string;
  area: number;
  modality: string;
  date: string;
  time: string;
  name: string;
  phone: string;
};

const TOTAL_STEPS = 6;
const TIME_SLOTS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function toStep(value: number): FunnelStep {
  return Math.max(1, Math.min(TOTAL_STEPS, value)) as FunnelStep;
}

const projectOptions = [
  { id: "reforma", label: "Reforma", helper: "Renovar um espaço existente", icon: Hammer },
  { id: "obra-nova", label: "Obra nova", helper: "Projeto do zero com orientação completa", icon: Building2 },
];

const environmentOptions = [
  { id: "residencial", label: "Residencial", helper: "Casa ou apartamento", icon: Home },
  { id: "comercial", label: "Comercial", helper: "Loja, salão ou clínica", icon: Building2 },
  { id: "corporativo", label: "Corporativo", helper: "Escritório ou operação empresarial", icon: Building },
  { id: "outro", label: "Outro", helper: "Contexto especial ou misto", icon: MoreHorizontal },
];

const modalityOptions = [
  { id: "voz", label: "Chamada de voz", helper: "Atendimento rápido por ligação ou WhatsApp", icon: PhoneCall },
  { id: "video", label: "Videochamada", helper: "Mais contexto visual para orientar melhor", icon: Video },
];

function buildAvailableDates(limit = 12): DateOption[] {
  const formatterWeekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "America/Sao_Paulo",
  });
  const formatterLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
  const days: DateOption[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  while (days.length < limit) {
    const weekdayNumber = cursor.getDay();
    if (weekdayNumber !== 0) {
      const weekday = formatterWeekday
        .format(cursor)
        .replace(".", "")
        .replace(/^\w/, (char) => char.toUpperCase());
      const label = formatterLabel
        .format(cursor)
        .replace(".", "")
        .replace(/^\d{2}\s/, (match) => match.toUpperCase());
      days.push({
        iso: cursor.toISOString().slice(0, 10),
        label,
        weekday,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function areaTier(area: number) {
  if (area < 40) return "Ambiente compacto";
  if (area < 90) return "Médio porte";
  if (area < 150) return "Projeto amplo";
  return "Grande escala";
}

function formatSelectedDate(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(`${iso}T12:00:00`))
    .replace(".", "")
    .replace(/^\w/, (char) => char.toUpperCase());
}

export default function QuizForm() {
  const navigate = useNavigate();
  const dateOptions = useMemo(() => buildAvailableDates(12), []);
  const [step, setStep] = useState<FunnelStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<QuoteFunnelState>({
    projectType: "",
    environmentType: "",
    area: 70,
    modality: "",
    date: "",
    time: "",
    name: "",
    phone: "",
  });

  const selectedDateLabel = useMemo(() => formatSelectedDate(formData.date), [formData.date]);

  const canAdvance =
    (step === 1 && Boolean(formData.projectType)) ||
    (step === 2 && Boolean(formData.environmentType)) ||
    step === 3 ||
    (step === 4 && Boolean(formData.modality)) ||
    (step === 5 && Boolean(formData.date && formData.time)) ||
    (step === 6 && Boolean(formData.name.trim() && formData.phone.trim()));

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const updateField = <K extends keyof QuoteFunnelState>(key: K, value: QuoteFunnelState[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const nextStep = () => {
    if (!canAdvance || step === TOTAL_STEPS) return;
    setStep((current) => toStep(current + 1));
  };

  const previousStep = () => {
    if (step === 1) return;
    setStep((current) => toStep(current - 1));
  };

  const pickAndAdvance = <K extends keyof QuoteFunnelState>(key: K, value: QuoteFunnelState[K]) => {
    updateField(key, value);
    window.setTimeout(() => {
      setStep((current) => toStep(current + 1));
    }, 180);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canAdvance) return;

    setIsSubmitting(true);
    const dateLabel = formatSelectedDate(formData.date);
    const leadPath = "leads";
    const meetingPath = "meetings";

    try {
      await addDoc(collection(db, leadPath), {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        city: "Não informado",
        product: "Atendimento consultivo agendado",
        environment: formData.environmentType,
        area: `${formData.area}m2`,
        date: new Date().toISOString().split("T")[0],
        status: "Novo",
        source: "site-agendamento",
        notes: [
          `Projeto: ${formData.projectType}`,
          `Tipo de ambiente: ${formData.environmentType}`,
          `Modalidade: ${formData.modality}`,
          `Data: ${dateLabel}`,
          `Horário: ${formData.time}`,
        ].join(" | "),
        createdAt: serverTimestamp(),
      });

      try {
        await addDoc(collection(db, meetingPath), {
          customerName: formData.name.trim(),
          customerEmail: "",
          phone: formData.phone.trim(),
          date: formData.date,
          time: formData.time,
          topic: `${formData.projectType} • ${formData.environmentType} • ${formData.area}m²`,
          status: "Agendada",
          source: "site-agendamento",
          modality: formData.modality,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (meetingError) {
        console.warn("Meeting save failed, lead kept successfully:", meetingError);
      }

      navigate("/success", {
        state: {
          type: "schedule",
          name: formData.name.trim(),
          modality: formData.modality,
          dateLabel,
          time: formData.time,
          projectType: formData.projectType,
          environmentType: formData.environmentType,
          area: formData.area,
        },
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, leadPath);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative overflow-hidden bg-primary py-16 md:py-24" id="contato">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute -left-24 top-20 h-64 w-64 rounded-full bg-action/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-[1.05fr_0.95fr] md:px-8">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          className="max-w-xl self-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-200">
            <CalendarDays className="h-4 w-4 text-action" />
            Atendimento consultivo Casaboni
          </span>

          <h2 className="mt-6 text-3xl font-light leading-tight text-white md:text-5xl">
            Agende um atendimento com olhar comercial e técnico para acelerar sua decisão.
          </h2>

          <p className="mt-5 max-w-lg text-sm leading-7 text-zinc-300 md:text-base">
            Seu cliente pediu algo mais direto e elegante, então trouxemos o orçamento para um funil
            de agendamento premium. Em poucos passos ele escolhe formato, dia, horário e já entra no
            radar da equipe com contexto suficiente para um atendimento melhor.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              "Atendimento com voz ou vídeo",
              "Fluxo mais organizado para o comercial",
              "Captação de lead com contexto real",
              "Experiência mais convincente no mobile",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-100 backdrop-blur-sm"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-action" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          onSubmit={handleSubmit}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(248,244,239,0.98)_100%)] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.28)] md:p-8"
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-zinc-200/60">
            <div className="h-full rounded-full bg-action transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="mb-8 pt-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-action">
                  Passo {step} de {TOTAL_STEPS}
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-primary">
                  {step === 1 && "Vamos começar pelo projeto"}
                  {step === 2 && "Entendendo o tipo de ambiente"}
                  {step === 3 && "Escala aproximada do atendimento"}
                  {step === 4 && "Como prefere conversar"}
                  {step === 5 && "Escolha o melhor horário"}
                  {step === 6 && "Confirmação do atendimento"}
                </h3>
              </div>
              <div className="hidden rounded-2xl bg-white/70 px-4 py-3 text-right shadow-sm md:block">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Resumo</p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {formData.modality || "Atendimento consultivo"}
                </p>
                <p className="text-xs text-outline">{selectedDateLabel && formData.time ? `${selectedDateLabel} • ${formData.time}` : "Defina seu horário"}</p>
              </div>
            </div>

            <p className="mt-3 max-w-xl text-sm leading-6 text-outline">
              {step === 1 && "Conte se estamos falando de uma renovação ou de um projeto novo para guiarmos a conversa do jeito certo."}
              {step === 2 && "Isso ajuda a equipe a entender o contexto comercial e o perfil do atendimento."}
              {step === 3 && "Não precisa ser exato. Essa faixa já ajuda a qualificar o atendimento sem travar a conversa."}
              {step === 4 && "Deixe o formato mais confortável para o cliente e mais útil para a recomendação do consultor."}
              {step === 5 && "Mantivemos uma seleção simples e elegante para acelerar a escolha no celular e no desktop."}
              {step === 6 && "Com nome e WhatsApp, a equipe já consegue confirmar o atendimento e seguir a conversa sem ruído."}
            </p>
          </div>

          <div className="min-h-[400px]">
            {step === 1 && (
              <div className="grid gap-4">
                {projectOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickAndAdvance("projectType", option.label)}
                    className={`group flex items-center gap-4 rounded-[1.6rem] border px-5 py-5 text-left transition-all ${
                      formData.projectType === option.label
                        ? "border-action bg-action/10 shadow-[0_18px_40px_rgba(216,90,48,0.18)]"
                        : "border-outline-variant bg-white/85 hover:border-action/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
                      <option.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-primary">{option.label}</p>
                      <p className="mt-1 text-sm text-outline">{option.helper}</p>
                    </div>
                    <ArrowRight className="ml-auto h-5 w-5 text-action transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {environmentOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickAndAdvance("environmentType", option.label)}
                    className={`rounded-[1.5rem] border p-5 text-left transition-all ${
                      formData.environmentType === option.label
                        ? "border-action bg-action/10 shadow-[0_16px_34px_rgba(216,90,48,0.16)]"
                        : "border-outline-variant bg-white/85 hover:border-action/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
                      <option.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-primary">{option.label}</p>
                    <p className="mt-1 text-sm leading-6 text-outline">{option.helper}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="rounded-[1.6rem] border border-outline-variant bg-white/85 p-5 md:p-6">
                <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-action">Metragem aproximada</p>
                    <div className="mt-3 flex items-center overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest">
                      <input
                        type="number"
                        min="10"
                        max="500"
                        value={formData.area}
                        onChange={(event) => updateField("area", Number(event.target.value) || 10)}
                        className="w-full bg-transparent px-5 py-4 text-3xl font-semibold text-primary outline-none"
                      />
                      <span className="border-l border-outline-variant bg-surface px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-outline">
                        m²
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-action/10 px-4 py-3 text-sm font-semibold text-action">
                    {areaTier(formData.area)}
                  </div>
                </div>

                <div className="mt-6">
                  <input
                    type="range"
                    min="10"
                    max="300"
                    step="5"
                    value={Math.min(300, formData.area)}
                    onChange={(event) => updateField("area", Number(event.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-high accent-action"
                  />
                  <div className="mt-3 flex justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-outline">
                    <span>10 m²</span>
                    <span>150 m²</span>
                    <span>300+ m²</span>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid gap-4">
                {modalityOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickAndAdvance("modality", option.label)}
                    className={`group flex items-center gap-4 rounded-[1.6rem] border px-5 py-5 text-left transition-all ${
                      formData.modality === option.label
                        ? "border-action bg-action/10 shadow-[0_18px_40px_rgba(216,90,48,0.18)]"
                        : "border-outline-variant bg-white/85 hover:border-action/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
                      <option.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-primary">{option.label}</p>
                      <p className="mt-1 text-sm text-outline">{option.helper}</p>
                    </div>
                    <ArrowRight className="ml-auto h-5 w-5 text-action transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="grid gap-6">
                <div className="rounded-[1.6rem] border border-outline-variant bg-white/85 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-action">Datas disponíveis</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {dateOptions.map((option) => (
                      <button
                        key={option.iso}
                        type="button"
                        onClick={() => updateField("date", option.iso)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          formData.date === option.iso
                            ? "border-action bg-action/10 shadow-[0_14px_28px_rgba(216,90,48,0.14)]"
                            : "border-outline-variant bg-surface-lowest hover:border-action/50"
                        }`}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-outline">{option.weekday}</p>
                        <p className="mt-1 text-base font-semibold text-primary">{option.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-outline-variant bg-white/85 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-action">Horários sugeridos</p>
                    <span className="text-xs text-outline">{selectedDateLabel || "Escolha uma data"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {TIME_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        disabled={!formData.date}
                        onClick={() => updateField("time", slot)}
                        className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-all ${
                          formData.time === slot
                            ? "border-action bg-action text-white shadow-[0_12px_26px_rgba(216,90,48,0.3)]"
                            : "border-outline-variant bg-surface-lowest text-primary hover:border-action/50 disabled:cursor-not-allowed disabled:opacity-45"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="grid gap-5">
                <div className="rounded-[1.6rem] border border-action/20 bg-action/10 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-action">Resumo do atendimento</p>
                  <div className="mt-4 grid gap-3 text-sm text-primary md:grid-cols-2">
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Projeto</span>
                      <span className="mt-1 block font-semibold">{formData.projectType}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Ambiente</span>
                      <span className="mt-1 block font-semibold">{formData.environmentType}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Formato</span>
                      <span className="mt-1 block font-semibold">{formData.modality}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Agenda</span>
                      <span className="mt-1 block font-semibold">
                        {selectedDateLabel} • {formData.time}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 rounded-[1.6rem] border border-outline-variant bg-white/85 p-5">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.24em] text-action">Nome completo</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      placeholder="Quem vai participar do atendimento?"
                      className="mt-3 w-full rounded-2xl border border-outline-variant bg-surface-lowest px-4 py-4 text-sm text-primary outline-none transition-colors placeholder:text-outline focus:border-action"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.24em] text-action">WhatsApp</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      placeholder="DDD + número para confirmação"
                      className="mt-3 w-full rounded-2xl border border-outline-variant bg-surface-lowest px-4 py-4 text-sm text-primary outline-none transition-colors placeholder:text-outline focus:border-action"
                    />
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl bg-primary px-4 py-4 text-sm text-zinc-100">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-action" />
                    <p>
                      Seus dados entram no CRM com o contexto do projeto, o que ajuda a equipe a dar
                      continuidade sem repetir perguntas básicas.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-outline-variant pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={previousStep}
              className={`inline-flex items-center gap-2 text-sm font-semibold text-outline transition-colors ${
                step === 1 ? "pointer-events-none opacity-0" : "hover:text-primary"
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={nextStep}
                disabled={!canAdvance}
                className="inline-flex items-center justify-center gap-3 rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canAdvance || isSubmitting}
                className="inline-flex items-center justify-center gap-3 rounded-full bg-action px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSubmitting ? "Confirmando..." : "Confirmar atendimento"}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </motion.form>
      </div>
    </section>
  );
}
