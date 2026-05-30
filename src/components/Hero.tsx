import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import BrandLogo from "./BrandLogo";

export default function Hero() {
  return (
    <section className="relative h-[88svh] min-h-[560px] md:min-h-[700px] flex items-center justify-center overflow-hidden bg-primary">
      <div className="absolute inset-0 z-0">
        <img
          className="w-full h-full object-cover opacity-60"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3DJz66JeZWsqmROOSwk6Xmp8CjHJuTdngnMo94YLhh5ClY42wZpPi_mGLMrHrQs_mZQUqIbNcjO17XRw94NctY7GIxdAiyCIaFWSYYcuEkqMbhwjqOMWyW3fBTYp0HKSnIO4XO8ypIhWSiyaipl1IkZ01VT-dh6asmo74ApRJc8zwukv6490yUD4Gio1VQAiebemdvRmt72dPsb_kCWtfwSH9ke1p0ptJdOtR5RsTDo3lMBkWkc4hFXib1qYNBdWqF15Ij9uCIw"
          alt="Luxury modern minimalist living room"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/40 to-primary"></div>
      </div>

      <div className="relative z-10 text-center px-5 md:px-6 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8 flex justify-center"
        >
          <BrandLogo light className="scale-[1.18] md:scale-[1.3] origin-center" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl md:text-7xl font-light text-white leading-tight mb-5 tracking-tighter"
        >
          Consultoria de <span className="font-bold text-action">Ambientes</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-base md:text-xl text-zinc-200 font-light mb-8 md:mb-10 max-w-2xl mx-auto tracking-wide"
        >
          Soluções premium para pisos, rodapés, telhas e ripados, com atendimento consultivo para
          você decidir com segurança e estilo.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col md:flex-row gap-3 md:gap-4 justify-center"
        >
          <button
            onClick={() => document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" })}
            className="px-7 md:px-10 py-3.5 md:py-4 action-gradient text-white font-bold tracking-widest text-xs md:text-sm uppercase transition-transform hover:scale-105 active:scale-95"
          >
            Explorar Coleção
          </button>
        </motion.div>
      </div>

      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2"
      >
        <ChevronDown className="text-white w-8 h-8 md:w-10 md:h-10" />
      </motion.div>
    </section>
  );
}
