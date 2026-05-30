import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, Droplets, ChevronLeft, ChevronRight } from "lucide-react";

const products = [
  {
    id: "veneza",
    name: "Veneza",
    collection: "Piso Vinílico Clicado",
    desc: "Charme e sofisticação inspirados na elegância italiana.",
    image: "https://i.imgur.com/KASG7HZ.png",
    tags: ["Premium", "Sofisticado"]
  },
  {
    id: "verona",
    name: "Verona",
    collection: "Piso Vinílico Clicado",
    desc: "Aconchego clássico e iluminação natural para seu ambiente.",
    image: "https://i.imgur.com/EaLN6CV.png",
    tags: ["Clássico", "Aconchegante"]
  },
  {
    id: "florenca",
    name: "Florença",
    collection: "Piso Vinílico Clicado",
    desc: "Leveza e elegância europeia em cada detalhe.",
    image: "https://i.imgur.com/FtHEUuS.png",
    tags: ["Elegante", "Leve"]
  },
  {
    id: "londres",
    name: "Londres",
    collection: "Piso Vinílico Clicado",
    desc: "Modernidade e sofisticação em tons de cinza contemporâneos.",
    image: "https://i.imgur.com/bDKAxLa.png",
    tags: ["Moderno", "Urbano"]
  },
  {
    id: "rio",
    name: "Rio de Janeiro",
    collection: "Piso Vinílico Clicado",
    desc: "Energia e calor em tons vibrantes e acolhedores.",
    image: "https://i.imgur.com/O29ld7u.png",
    tags: ["Vibrante", "Energia"]
  },
  {
    id: "washington",
    name: "Washington",
    collection: "Piso Vinílico Clicado",
    desc: "Clássico e elegante em tons claros e atemporais.",
    image: "https://i.imgur.com/UKDHwHM.png",
    tags: ["Clássico", "Elegante"]
  },
  {
    id: "shingle",
    name: "Telhas Shingle",
    collection: "Cobertura Premium",
    desc: "Alta durabilidade e isolamento térmico com estética americana.",
    image: "https://images.unsplash.com/photo-1632759145351-1d592919f522?q=80&w=2070&auto=format&fit=crop",
    tags: ["Resistente", "Térmico"]
  },
  {
    id: "ripado",
    name: "Ripados WPC",
    collection: "Revestimento Decorativo",
    desc: "Estética moderna em madeira composta para paredes e tetos.",
    image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop",
    tags: ["Design", "Durável"]
  },
  {
    id: "rodapes",
    name: "Rodapés Poliestireno",
    collection: "Acabamento Premium",
    desc: "Resistentes à umidade e fáceis de limpar. Modelos de 7cm e 10cm.",
    image: "https://images.unsplash.com/photo-1505693415957-28309913d3bb?q=80&w=2070&auto=format&fit=crop",
    tags: ["Resistente", "Prático"]
  }
];

export default function ProductSection() {
  const [currentPage, setCurrentPage] = useState(0);
  const productsPerPage = 2;
  const totalPages = Math.ceil(products.length / productsPerPage);

  const currentProducts = products.slice(
    currentPage * productsPerPage,
    (currentPage + 1) * productsPerPage
  );

  const nextPage = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const prevPage = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  return (
    <section className="py-24 px-8 bg-surface" id="produtos">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="max-w-xl"
          >
            <h2 className="text-4xl font-bold text-primary uppercase tracking-tighter mb-4">Curadoria de Revestimentos</h2>
            <p className="text-outline font-light leading-relaxed">
              Nossa seleção premium une design, qualidade e funcionalidade. Transforme seu ambiente com a identidade única da Casaboni.
            </p>
          </motion.div>
          <div className="flex items-center gap-4 border-b border-outline-variant pb-4">
            <span className="text-action font-bold text-sm tracking-widest uppercase">Página {currentPage + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <button 
                onClick={prevPage}
                className="p-2 hover:bg-surface-low rounded-full transition-colors text-primary"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={nextPage}
                className="p-2 hover:bg-surface-low rounded-full transition-colors text-primary"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 min-h-[500px]">
          <AnimatePresence mode="wait">
            {currentProducts.map((product, i) => (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: i * 0.1 }}
                className="group cursor-pointer"
              >
                <div className="relative overflow-hidden bg-surface-low mb-6">
                  <img 
                    className="w-full aspect-[16/9] object-cover transition-transform duration-700 group-hover:scale-105" 
                    src={product.image} 
                    alt={product.name}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <span className="bg-primary text-white px-4 py-1 text-xs font-bold uppercase tracking-widest">{product.collection}</span>
                    {product.tags.map(tag => (
                      <span key={tag} className="bg-white/90 backdrop-blur text-primary px-4 py-1 text-xs font-bold uppercase tracking-widest">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-primary uppercase">{product.name}</h3>
                    <p className="text-sm text-outline font-light mt-2 max-w-xs">{product.desc}</p>
                    <div className="flex gap-4 mt-4">
                      <div className="flex items-center gap-1 text-outline">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-[10px] uppercase font-bold tracking-tighter">Alta Durabilidade</span>
                      </div>
                      <div className="flex items-center gap-1 text-outline">
                        <Droplets className="w-4 h-4" />
                        <span className="text-[10px] uppercase font-bold tracking-tighter">Fácil Limpeza</span>
                      </div>
                    </div>
                  </div>
                  <button className="px-6 py-3 bg-action text-white font-bold text-xs uppercase tracking-widest hover:bg-[#c96a2b] transition-colors whitespace-nowrap">
                    Saiba Mais
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-12">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentPage === i ? "bg-action w-8" : "bg-outline-variant"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
