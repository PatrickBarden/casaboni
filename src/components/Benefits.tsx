import { Sparkles, BookOpen, LayoutGrid } from "lucide-react";

export default function Benefits() {
  const items = [
    {
      title: "Consultoria Especializada",
      desc: "Não vendemos apenas produtos. Orientamos seu projeto com foco comercial e técnico.",
      icon: Sparkles,
    },
    {
      title: "Atendimento Estrategico",
      desc: "Entendemos seu ambiente e indicamos a melhor linha para acelerar sua decisão.",
      icon: BookOpen,
    },
    {
      title: "Portfólio Completo",
      desc: "Pisos, rodapés, telhas e ripados para entregar um acabamento de alto padrão.",
      icon: LayoutGrid,
    },
  ];

  return (
    <section className="py-14 md:py-20 bg-surface-low border-y border-outline-variant">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Diferenciais Casaboni</h3>
            <span className="text-[10px] uppercase tracking-widest text-outline">Arraste</span>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory no-scrollbar">
            {items.map((item, i) => (
              <div
                key={i}
                className="min-w-[84%] snap-start bg-white border border-outline-variant p-6 flex flex-col items-start"
              >
                <div className="w-12 h-12 rounded-full border border-action/30 flex items-center justify-center mb-4">
                  <item.icon className="text-action w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-primary uppercase tracking-wide mb-2">{item.title}</h4>
                <p className="text-sm text-outline font-light">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:grid grid-cols-3 gap-10 lg:gap-16">
          {items.map((item, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-action/20 flex items-center justify-center mb-6">
                <item.icon className="text-action w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-primary uppercase tracking-widest mb-2">{item.title}</h4>
              <p className="text-sm text-outline font-light max-w-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
