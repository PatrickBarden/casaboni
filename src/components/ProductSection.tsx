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
    tags: ["Premium", "Sofisticado"],
  },
  {
    id: "verona",
    name: "Verona",
    collection: "Piso Vinílico Clicado",
    desc: "Aconchego clássico e iluminação natural para seu ambiente.",
    image: "https://i.imgur.com/EaLN6CV.png",
    tags: ["Clássico", "Aconchegante"],
  },
  {
    id: "florenca",
    name: "Florença",
    collection: "Piso Vinílico Clicado",
    desc: "Leveza e elegância europeia em cada detalhe.",
    image: "https://i.imgur.com/FtHEUuS.png",
    tags: ["Elegante", "Leve"],
  },
  {
    id: "londres",
    name: "Londres",
    collection: "Piso Vinílico Clicado",
    desc: "Modernidade e sofisticação em tons de cinza contemporâneos.",
    image: "https://i.imgur.com/bDKAxLa.png",
    tags: ["Moderno", "Urbano"],
  },
  {
    id: "rio",
    name: "Rio de Janeiro",
    collection: "Piso Vinílico Clicado",
    desc: "Energia e calor em tons vibrantes e acolhedores.",
    image: "https://i.imgur.com/O29ld7u.png",
    tags: ["Vibrante", "Energia"],
  },
  {
    id: "washington",
    name: "Washington",
    collection: "Piso Vinílico Clicado",
    desc: "Clássico e elegante em tons claros e atemporais.",
    image: "https://i.imgur.com/UKDHwHM.png",
    tags: ["Clássico", "Elegante"],
  },
  {
    id: "shingle",
    name: "Telhas Shingle",
    collection: "Cobertura Premium",
    desc: "Alta durabilidade e isolamento térmico com estética americana.",
    image:
      "https://images.unsplash.com/photo-1632759145351-1d592919f522?q=80&w=2070&auto=format&fit=crop",
    tags: ["Resistente", "Térmico"],
  },
  {
    id: "ripado",
    name: "Ripados WPC",
    collection: "Revestimento Decorativo",
    desc: "Estética moderna em madeira composta para paredes e tetos.",
    image:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop",
    tags: ["Design", "Durável"],
  },
  {
    id: "rodapes",
    name: "Rodapés Poliestireno",
    collection: "Acabamento Premium",
    desc: "Resistentes à umidade e fáceis de limpar. Modelos de 7cm e 10cm.",
    image:
      "https://images.unsplash.com/photo-1505693415957-28309913d3bb?q=80&w=2070&auto=format&fit=crop",
    tags: ["Resistente", "Prático"],
  },
];

function ProductCard({ product }: { product: (typeof products)[number] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="group cursor-pointer bg-white border border-outline-variant shadow-ambient"
    >
      <div className="relative overflow-hidden bg-surface-low mb-5">
        <img
          className="w-full aspect-[16/10] object-cover transition-transform duration-700 group-hover:scale-105"
          src={product.image}
          alt={product.name}
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4 flex flex-col gap-1.5">
          <span className="bg-primary text-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            {product.collection}
          </span>
          {product.tags.map((tag) => (
            <span
              key={tag}
              className="bg-white/90 backdrop-blur text-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="px-5 pb-5">
        <h3 className="text-xl font-bold text-primary uppercase">{product.name}</h3>
        <p className="text-sm text-outline font-light mt-2">{product.desc}</p>
        <div className="flex gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-1 text-outline">
            <CheckCircle className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-tighter">Alta Durabilidade</span>
          </div>
          <div className="flex items-center gap-1 text-outline">
            <Droplets className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-tighter">Facil Limpeza</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProductSection() {
  const [currentPage, setCurrentPage] = useState(0);
  const productsPerPageDesktop = 3;
  const totalDesktopPages = Math.ceil(products.length / productsPerPageDesktop);
  const currentDesktopProducts = products.slice(
    currentPage * productsPerPageDesktop,
    (currentPage + 1) * productsPerPageDesktop
  );

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalDesktopPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalDesktopPages) % totalDesktopPages);

  return (
    <section className="py-14 md:py-24 px-5 md:px-8 bg-surface" id="produtos">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-end mb-8 md:mb-16 gap-6 md:gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="max-w-xl"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-primary uppercase tracking-tighter mb-4">
              Linhas Casaboni
            </h2>
            <p className="text-outline font-light leading-relaxed">
              Soluções premium em acabamentos para acelerar sua escolha com segurança e alto padrão
              estético.
            </p>
          </motion.div>

          <div className="hidden md:flex items-center gap-4 border-b border-outline-variant pb-4">
            <span className="text-action font-bold text-sm tracking-widest uppercase">
              Pagina {currentPage + 1} de {totalDesktopPages}
            </span>
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

        <div className="md:hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase tracking-widest font-bold text-outline">
              Arraste para ver mais produtos
            </span>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-3 snap-x snap-mandatory no-scrollbar">
            {products.map((product) => (
              <div key={product.id} className="min-w-[84%] snap-start">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:block">
          <div className="grid grid-cols-3 gap-8 min-h-[580px]">
            <AnimatePresence mode="wait">
              {currentDesktopProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </AnimatePresence>
          </div>

          <div className="flex justify-center gap-2 mt-10">
            {Array.from({ length: totalDesktopPages }).map((_, i) => (
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
      </div>
    </section>
  );
}
