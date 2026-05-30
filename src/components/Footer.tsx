import { Share2, HelpCircle } from "lucide-react";
import BrandLogo from "./BrandLogo";

export default function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-6 md:px-12 py-12 md:py-16 w-full gap-8">
        <BrandLogo light />

        <div className="flex flex-wrap gap-6 md:gap-10">
          {["Políticas de Privacidade", "Termos de Uso", "Sustentabilidade", "Instalação"].map(
            (link) => (
              <a
                key={link}
                href="#"
                className="text-zinc-300 hover:text-white transition-all text-xs md:text-sm uppercase tracking-widest font-medium"
              >
                {link}
              </a>
            )
          )}
        </div>

        <div className="flex gap-5 md:gap-6">
          <Share2 className="opacity-70 hover:opacity-100 cursor-pointer transition-opacity w-5 h-5 md:w-6 md:h-6" />
          <HelpCircle className="opacity-70 hover:opacity-100 cursor-pointer transition-opacity w-5 h-5 md:w-6 md:h-6" />
        </div>
      </div>

      <div className="px-6 md:px-12 py-5 md:py-6 border-t border-white/10 text-center">
        <p className="text-[10px] text-zinc-400 uppercase tracking-widest">
          © 2026 Casaboni. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
