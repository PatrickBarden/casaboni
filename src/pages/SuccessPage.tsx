import { motion } from "motion/react";
import { CheckCircle, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function SuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center pt-24 px-6 relative overflow-hidden bg-surface">
      {/* Background Architectural Elements */}
      <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-primary transform skew-x-12 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 border-t-2 border-r-2 border-primary -translate-x-1/2 translate-y-1/2"></div>
      </div>

      <div className="max-w-3xl w-full z-10 text-center flex flex-col items-center">
        {/* Success Icon Shell */}
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-12 relative"
        >
          <div className="absolute inset-0 bg-action/10 scale-150 blur-3xl rounded-full"></div>
          <div className="w-32 h-32 flex items-center justify-center bg-surface-lowest shadow-ambient relative">
            <CheckCircle className="w-20 h-20 text-action" />
          </div>
        </motion.div>

        {/* Content Area */}
        <div className="space-y-6">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-light text-5xl md:text-6xl text-primary tracking-tight leading-tight"
          >
            Seu pedido foi enviado com sucesso!
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-outline text-lg md:text-xl font-light leading-relaxed max-w-xl mx-auto"
          >
            Nossa equipe entrará em contato em breve para finalizar o seu orçamento e transformar seu projeto arquitetônico.
          </motion.p>
        </div>

        {/* Transactional CTA Block */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-16 w-full max-w-md"
        >
          <a 
            href="https://wa.me/5511987654321" 
            target="_blank" 
            rel="noopener noreferrer"
            className="action-gradient w-full py-6 px-10 text-white font-bold tracking-widest uppercase flex items-center justify-center gap-4 transition-transform hover:scale-[1.02] active:scale-95 shadow-lg"
          >
            <MessageCircle className="w-6 h-6 fill-white" />
            Falar agora no WhatsApp
          </a>
          
          <div className="mt-8 flex justify-center gap-8 text-sm font-medium tracking-widest text-outline uppercase">
            <Link to="/admin" className="hover:text-action transition-colors">Ver Dashboard</Link>
            <span className="opacity-20">|</span>
            <Link to="/" className="hover:text-action transition-colors">Voltar ao Início</Link>
          </div>
        </motion.div>

        {/* Asymmetrical Architectural Image Preview */}
        <div className="mt-24 grid grid-cols-12 w-full max-w-5xl gap-4 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
          <div className="col-span-8 h-48 bg-surface-high relative overflow-hidden">
            <img 
              className="w-full h-full object-cover" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpA7FuB83WqWsMkFv52YTqJI0pmsWWDufp6LqzCCAk7Lo7HoKDQUI9FQJxc2f6PLWHHEQnt3Tp4vZdJNROX4QhnKnAmf-cGVlfaavpNlDLAiihtm54FgJ5gAs-u3E29W-GGkBVTVUxcEFNvRLXt4jLOw6J5UNH8gR9_kICvnt_NY4PYuAHLmEF7rgdctd7qlYJqPpoqf9I559xZo1VTglrGiea4IwW9qC1T_u_SG0kTM4_WxSOVYYVkOv79IaGMpeiSHtDNmYW_g" 
              alt="Interior detail"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="col-span-4 h-48 bg-surface-high relative overflow-hidden">
            <img 
              className="w-full h-full object-cover" 
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
