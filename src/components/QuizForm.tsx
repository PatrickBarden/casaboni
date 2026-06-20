import { FormEvent, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
const TIME_ZONE = "America/Sao_Paulo";
const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];

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

function getTodayInBrazil() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "2000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return new Date(`${year}-${month}-${day}T12:00:00`);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function buildMonthDays(viewMonth: Date) {
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1, 12);
  const firstWeekday = monthStart.getDay();
  const monthLength = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= monthLength; day += 1) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day, 12));
  }

  return cells;
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
    timeZone: TIME_ZONE,
  })
    .format(new Date(`${iso}T12:00:00`))
    .replace(".", "")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function getStepTitle(step: FunnelStep) {
  if (step === 1) return "Vamos começar";
  if (step === 2) return "Contexto do ambiente";
  if (step === 3) return "Metragem aproximada";
  if (step === 4) return "Modalidade do atendimento";
  if (step === 5) return "Escolha dia e horário";
  return "Confirme seus dados";
}

function getStepDescription(step: FunnelStep) {
  if (step === 1) return "Seu projeto é uma reforma ou uma obra nova?";
  if (step === 2) return "Que tipo de ambiente vamos atender?";
  if (step === 3) return "Não precisa ser exato, é só para entendermos a escala do atendimento.";
  if (step === 4) return "Escolha a forma mais confortável para conversar com a equipe.";
  if (step === 5) return "Selecione o melhor dia e um horário disponível para o atendimento.";
  return "Enviamos a confirmação e o retorno da equipe pelo WhatsApp.";
}

export default function QuizForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<FunnelStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const today = getTodayInBrazil();
    return new Date(today.getFullYear(), today.getMonth(), 1, 12);
  });
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

  const today = useMemo(() => getTodayInBrazil(), []);
  const monthDays = useMemo(() => buildMonthDays(viewMonth), [viewMonth]);
  const selectedDateLabel = useMemo(() => formatSelectedDate(formData.date), [formData.date]);
  const selectedMonthLabel = `${MONTHS_PT[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const canGoPreviousMonth = !isSameMonth(viewMonth, new Date(today.getFullYear(), today.getMonth(), 1, 12));

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

  const selectDate = (date: Date) => {
    setFormData((current) => ({
      ...current,
      date: toIsoDate(date),
      time: "",
    }));
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
    <section className="relative overflow-hidden bg-primary px-4 py-16 md:px-6 md:py-24" id="contato">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute left-[-4rem] top-20 h-64 w-64 rounded-full bg-action/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        onSubmit={handleSubmit}
        className="relative mx-auto max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#fbfaf7] p-5 text-primary shadow-[0_32px_80px_rgba(0,0,0,0.28)] md:p-7"
      >
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e5ddd2] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-action">
            <CalendarDays className="h-4 w-4" />
            Atendimento Casaboni
          </span>

          <h2 className="mt-5 text-[1.9rem] font-semibold leading-tight text-primary md:text-[2.15rem]">
            Agende seu atendimento
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-outline md:text-[15px]">
            Fale com um consultor comercial no dia e horário que fizer mais sentido para você.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.18em] text-outline">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-action" />
              Atendimento no Rio Grande do Sul
            </span>
            <span className="hidden text-[#d2c8bb] md:inline">•</span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-action" />
              Orientação personalizada
            </span>
          </div>
        </div>

        <div className="mb-7 h-1.5 overflow-hidden rounded-full bg-[#eee7dd]">
          <div className="h-full rounded-full bg-action transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="min-h-[420px]">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-action">
              Passo {step} de {TOTAL_STEPS}
            </p>
            <h3 className="mt-3 text-[1.45rem] font-semibold leading-tight text-primary md:text-[1.65rem]">
              {getStepTitle(step)}
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-outline">{getStepDescription(step)}</p>
          </div>

          <div>
            {step === 1 && (
              <div className="grid gap-4">
                {projectOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickAndAdvance("projectType", option.label)}
                    className={`group flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all ${
                      formData.projectType === option.label
                        ? "border-2 border-action bg-[#fdf2ec] shadow-[0_16px_32px_rgba(216,90,48,0.12)]"
                        : "border-[#e3ddd2] bg-white hover:border-action/60"
                    }`}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fdf2ec] text-action">
                      <option.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-primary">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-outline">{option.helper}</p>
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
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      formData.environmentType === option.label
                        ? "border-2 border-action bg-[#fdf2ec] shadow-[0_16px_32px_rgba(216,90,48,0.12)]"
                        : "border-[#e3ddd2] bg-white hover:border-action/60"
                    }`}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fdf2ec] text-action">
                      <option.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-[15px] font-semibold text-primary">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 text-outline">{option.helper}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="rounded-2xl border border-[#e3ddd2] bg-white p-5 md:p-6">
                <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-action">Área estimada</p>
                    <div className="mt-3 flex items-center overflow-hidden rounded-2xl border border-[#cfc7ba] bg-[#fbfaf7]">
                      <input
                        type="number"
                        min="10"
                        max="500"
                        value={formData.area}
                        onChange={(event) => updateField("area", Number(event.target.value) || 10)}
                        className="w-full bg-transparent px-5 py-4 text-3xl font-semibold text-primary outline-none"
                      />
                      <span className="border-l border-[#cfc7ba] bg-[#f1ece3] px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-outline">
                        m²
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#fdf2ec] px-4 py-3 text-sm font-semibold text-action">
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
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#eee7dd] accent-action"
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
                    className={`group flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all ${
                      formData.modality === option.label
                        ? "border-2 border-action bg-[#fdf2ec] shadow-[0_16px_32px_rgba(216,90,48,0.12)]"
                        : "border-[#e3ddd2] bg-white hover:border-action/60"
                    }`}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fdf2ec] text-action">
                      <option.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-primary">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-outline">{option.helper}</p>
                    </div>
                    <ArrowRight className="ml-auto h-5 w-5 text-action transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="grid gap-6">
                <div className="rounded-2xl border border-[#e3ddd2] bg-white p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}
                      disabled={!canGoPreviousMonth}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e3ddd2] bg-[#fbfaf7] text-outline transition hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div className="text-center">
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-action">Datas disponíveis</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-primary">{selectedMonthLabel}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e3ddd2] bg-[#fbfaf7] text-outline transition hover:border-action hover:text-action"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LETTERS.map((label, index) => (
                      <span
                        key={`${label}-${index}`}
                        className="py-1 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-outline"
                      >
                        {label}
                      </span>
                    ))}

                    {monthDays.map((day, index) => {
                      if (!day) {
                        return <span key={`empty-${index}`} className="aspect-square" />;
                      }

                      const isPast = day.getTime() < today.getTime();
                      const isSunday = day.getDay() === 0;
                      const iso = toIsoDate(day);
                      const isSelected = formData.date === iso;
                      const isDisabled = isPast || isSunday;

                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => selectDate(day)}
                          className={`aspect-square rounded-xl text-sm transition ${
                            isSelected
                              ? "bg-action font-semibold text-white"
                              : "text-primary hover:bg-[#fdf2ec] disabled:cursor-default disabled:text-[#d6cdc2] disabled:hover:bg-transparent"
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e3ddd2] bg-white p-5">
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
                        className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${
                          formData.time === slot
                            ? "border-2 border-action bg-[#fdf2ec] text-action"
                            : "border-[#cfc7ba] bg-white text-primary hover:border-action/50 disabled:cursor-not-allowed disabled:opacity-45"
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
                <div className="rounded-2xl border border-action/20 bg-[#fdf2ec] p-5">
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

                <div className="grid gap-4 rounded-2xl border border-[#e3ddd2] bg-white p-5">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.24em] text-action">Nome completo</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      placeholder="Quem vai participar do atendimento?"
                      className="mt-3 w-full rounded-2xl border border-[#cfc7ba] bg-[#fbfaf7] px-4 py-4 text-sm text-primary outline-none transition-colors placeholder:text-outline focus:border-action"
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
                      className="mt-3 w-full rounded-2xl border border-[#cfc7ba] bg-[#fbfaf7] px-4 py-4 text-sm text-primary outline-none transition-colors placeholder:text-outline focus:border-action"
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
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-[#e3ddd2] pt-5">
          <button
            type="button"
            onClick={previousStep}
            className={`inline-flex items-center gap-2 text-sm font-medium text-outline transition-colors ${
              step === 1 ? "pointer-events-none opacity-0" : "hover:text-primary"
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <span className="text-xs uppercase tracking-[0.18em] text-outline">
            Passo {step} de {TOTAL_STEPS}
          </span>
        </div>

        <div className="mt-4 flex justify-end">
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canAdvance}
              className="inline-flex items-center justify-center gap-3 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canAdvance || isSubmitting}
              className="inline-flex items-center justify-center gap-3 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? "Confirmando..." : "Confirmar atendimento"}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.form>
    </section>
  );
}
