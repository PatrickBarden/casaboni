import { Share2, HelpCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="flex flex-col md:flex-row justify-between items-center px-12 py-16 w-full">
        <div className="mb-8 md:mb-0">
          <span className="text-2xl font-medium tracking-tighter uppercase">Casaboni</span>
          <p className="text-[10px] text-zinc-400 mt-2 uppercase tracking-widest">Architectural Curator</p>
        </div>
        
        <div className="flex flex-wrap justify-center gap-10">
          {["Políticas de Privacidade", "Termos de Uso", "Sustentabilidade", "Instalação"].map((link) => (
            <a key={link} href="#" className="text-zinc-400 hover:text-white transition-all text-sm uppercase tracking-widest font-medium">
              {link}
            </a>
          ))}
        </div>
        
        <div className="mt-8 md:mt-0 flex gap-6">
          <Share2 className="opacity-60 hover:opacity-100 cursor-pointer transition-opacity w-6 h-6" />
          <HelpCircle className="opacity-60 hover:opacity-100 cursor-pointer transition-opacity w-6 h-6" />
        </div>
      </div>
      
      <div className="px-12 py-6 border-t border-white/5 text-center">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          © 2024 Architectural Curator. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
