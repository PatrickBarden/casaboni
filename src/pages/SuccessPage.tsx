import { motion } from "motion/react";
import { CalendarDays, CheckCircle, MessageCircle, PhoneCall } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

type SuccessState = {
  type?: "schedule";
  name?: string;
  modality?: string;
  dateLabel?: string;
  time?: string;
  projectType?: string;
  environmentType?: string;
  area?: number;
};

export default function SuccessPage() {
  const location = useLocation();
  const state = (location.state || {}) as SuccessState;
  const isSchedule = state.type === "schedule";
  const firstName = state.name?.trim().split(" ")[0] || "";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-6 pt-24">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-5">
        <div className="absolute right-0 top-0 h-full w-1/2 translate-x-1/2 skew-x-12 bg-primary" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 border-r-2 border-t-2 border-primary" />
      </div>

      <div className="z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-12"
        >
          <div className="absolute inset-0 rounded-full bg-action/10 blur-3xl scale-150" />
          <div className="relative flex h-32 w-32 items-center justify-center bg-surface-lowest shadow-ambient">
            <CheckCircle className="h-20 w-20 text-action" />
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl font-light leading-tight tracking-tight text-primary md:text-6xl"
          >
            {isSchedule ? `Atendimento confirmado${firstName ? `, ${firstName}` : ""}!` : "Seu pedido foi enviado com sucesso!"}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mx-auto max-w-2xl text-lg font-light leading-relaxed text-outline md:text-xl"
          >
            {isSchedule
              ? "Sua solicitação entrou no CRM com contexto do projeto e a equipe Casaboni já pode seguir o atendimento com muito mais precisão."
              : "Nossa equipe entrará em contato em breve para finalizar o seu orçamento e transformar seu projeto arquitetônico."}
          </motion.p>
        </div>

        {isSchedule && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="mt-10 grid w-full max-w-2xl gap-4 rounded-[2rem] border border-outline-variant bg-white p-6 text-left shadow-ambient md:grid-cols-2"
          >
            <div className="rounded-2xl bg-surface px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-action">Agenda</p>
              <p className="mt-3 text-base font-semibold text-primary">
                {state.dateLabel || "Data a confirmar"}{state.time ? ` • ${state.time}` : ""}
              </p>
              <p className="mt-1 text-sm text-outline">{state.modality || "Atendimento consultivo"}</p>
            </div>

            <div className="rounded-2xl bg-surface px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-action">Projeto</p>
              <p className="mt-3 text-base font-semibold text-primary">{state.projectType || "Projeto consultivo"}</p>
              <p className="mt-1 text-sm text-outline">
                {state.environmentType || "Ambiente"}{state.area ? ` • ${state.area}m²` : ""}
              </p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 w-full max-w-md"
        >
          <a
            href="https://wa.me/5511987654321"
            target="_blank"
            rel="noopener noreferrer"
            className="action-gradient flex w-full items-center justify-center gap-4 px-10 py-6 text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
          >
            {isSchedule ? <PhoneCall className="h-6 w-6" /> : <MessageCircle className="h-6 w-6 fill-white" />}
            <span className="font-bold uppercase tracking-widest">
              {isSchedule ? "Confirmar detalhes no WhatsApp" : "Falar agora no WhatsApp"}
            </span>
          </a>

          <div className="mt-8 flex justify-center gap-8 text-sm font-medium uppercase tracking-widest text-outline">
            <Link to="/admin" className="transition-colors hover:text-action">
              Ver Dashboard
            </Link>
            <span className="opacity-20">|</span>
            <Link to="/" className="transition-colors hover:text-action">
              Voltar ao início
            </Link>
          </div>
        </motion.div>

        <div className="mt-20 grid w-full max-w-5xl grid-cols-12 gap-4 opacity-45 grayscale transition-all duration-700 hover:grayscale-0">
          <div className="relative col-span-12 h-44 overflow-hidden bg-surface-high md:col-span-8 md:h-52">
            <img
              className="h-full w-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpA7FuB83WqWsMkFv52YTqJI0pmsWWDufp6LqzCCAk7Lo7HoKDQUI9FQJxc2f6PLWHHEQnt3Tp4vZdJNROX4QhnKnAmf-cGVlfaavpNlDLAiihtm54FgJ5gAs-u3E29W-GGkBVTVUxcEFNvRLXt4jLOw6J5UNH8gR9_kICvnt_NY4PYuAHLmEF7rgdctd7qlYJqPpoqf9I559xZo1VTglrGiea4IwW9qC1T_u_SG0kTM4_WxSOVYYVkOv79IaGMpeiSHtDNmYW_g"
              alt="Interior detail"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-primary/75 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
              <CalendarDays className="h-4 w-4 text-action" />
              Casaboni consultoria
            </div>
          </div>
          <div className="relative col-span-12 h-44 overflow-hidden bg-surface-high md:col-span-4 md:h-52">
            <img
              className="h-full w-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCM08-g7QbY2ZlDuKK_pbJYqqepNXbRUuJHJMHR6bAJAGvT28M6jAUgTAsf0zEQ-E0OBETfFiliGj3GMJnNBpiho9iEZ5umK3rNj6u8jiK42uDxoL-aR46tiIHRGrRxhAGpbI-z6RUaNzRhNTkyfq0WR4nWOD1rmrFx_Lu2vpy04TNV8iUM020n3nIOtmvKqbEf-C1t_-w64TpxmVItXRMVmO5w1QAVNW7v0ueFIl4LV5N4oBfyWvj-HiDZzZuhLB5WE9LW3S4rfQ"
              alt="Texture detail"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
