import { Sparkles, BookOpen, LayoutGrid } from "lucide-react";

export default function Benefits() {
  const items = [
    {
      title: "Curadoria Especializada",
      desc: "Não vendemos apenas produtos, entregamos conceitos arquitetônicos selecionados por especialistas.",
      icon: Sparkles,
    },
    {
      title: "Storytelling Único",
      desc: "Nossas linhas são inspiradas em cidades e sensações, transformando seu ambiente em uma experiência.",
      icon: BookOpen,
    },
    {
      title: "Portfólio Completo",
      desc: "Do piso ao telhado, oferecemos uma curadoria completa para elevar o padrão do seu projeto.",
      icon: LayoutGrid,
    },
  ];

  return (
    <section className="py-20 bg-surface-low border-y border-outline-variant">
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
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
