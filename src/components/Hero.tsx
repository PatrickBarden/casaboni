import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden bg-primary">
      <div className="absolute inset-0 z-0">
        <img 
          className="w-full h-full object-cover opacity-60" 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3DJz66JeZWsqmROOSwk6Xmp8CjHJuTdngnMo94YLhh5ClY42wZpPi_mGLMrHrQs_mZQUqIbNcjO17XRw94NctY7GIxdAiyCIaFWSYYcuEkqMbhwjqOMWyW3fBTYp0HKSnIO4XO8ypIhWSiyaipl1IkZ01VT-dh6asmo74ApRJc8zwukv6490yUD4Gio1VQAiebemdvRmt72dPsb_kCWtfwSH9ke1p0ptJdOtR5RsTDo3lMBkWkc4hFXib1qYNBdWqF15Ij9uCIw" 
          alt="Luxury modern minimalist living room"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/40 to-primary"></div>
      </div>
      
      <div className="relative z-10 text-center px-6 max-w-4xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8 flex justify-center"
        >
          <span className="text-white text-3xl font-light tracking-tighter uppercase border-b border-action pb-2">Casaboni</span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-5xl md:text-7xl font-light text-white leading-tight mb-6 tracking-tighter"
        >
          Curadoria de <span className="font-bold text-action">Ambientes</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-xl text-zinc-300 font-light mb-10 max-w-2xl mx-auto tracking-wide"
        >
          Transformamos espaços com sofisticação, praticidade e durabilidade. Soluções modernas em revestimentos para quem busca design e aconchego.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col md:flex-row gap-4 justify-center"
        >
          <button 
            onClick={() => document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-10 py-4 action-gradient text-white font-bold tracking-widest text-sm uppercase transition-transform hover:scale-105 active:scale-95"
          >
            Explorar Coleção
          </button>
        </motion.div>
      </div>
      
      <motion.div 
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <ChevronDown className="text-white w-10 h-10" />
      </motion.div>
    </section>
  );
}
