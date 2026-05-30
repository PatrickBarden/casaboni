import { Link } from "react-router-dom";
import { Instagram, Mail, MapPin, Phone } from "lucide-react";
import BrandLogo from "./BrandLogo";

const institutionalLinks = [
  { label: "Políticas de Privacidade", href: "/politicas-de-privacidade" },
  { label: "Termos de Uso", href: "/termos-de-uso" },
  { label: "Sustentabilidade", href: "/sustentabilidade" },
  { label: "Instalação", href: "/instalacao" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-primary text-white border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-14 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <BrandLogo light />
          <p className="mt-5 text-sm leading-7 text-zinc-300 max-w-sm">
            Soluções premium em pisos, rodapés, telhas e ripados, com atendimento consultivo
            para clientes residenciais e corporativos.
          </p>
        </div>

        <div className="md:col-span-4">
          <h3 className="text-xs uppercase tracking-[0.22em] text-zinc-300 mb-4">Institucional</h3>
          <div className="space-y-3">
            {institutionalLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="block text-sm text-white/90 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="md:col-span-4">
          <h3 className="text-xs uppercase tracking-[0.22em] text-zinc-300 mb-4">Contato</h3>
          <div className="space-y-3 text-sm text-white/90">
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-action" /> WhatsApp: (55) 99178-0627
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-action" /> contato@casaboni.com.br
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-action" /> Santa Catarina, Brasil
            </p>
            <a
              href="https://www.instagram.com/casaboni_/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm hover:text-white transition-colors"
            >
              <Instagram className="w-4 h-4 text-action" /> @casaboni_
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-6 md:px-12 py-5">
        <p className="text-[11px] text-zinc-400 uppercase tracking-widest text-center">
          © {year} Casaboni. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}

