import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Droplets,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Product } from "../types";

type LandingProduct = Product & {
  desc: string;
  tags: string[];
};

const fallbackProducts = [
  {
    id: "veneza",
    name: "Veneza",
    collection: "Piso Vinilico Clicado",
    desc: "Visual luminoso e sofisticado para compor salas e quartos com sensação de leveza.",
    image: "https://i.imgur.com/KASG7HZ.png",
    tags: ["Premium", "Claros"],
  },
  {
    id: "verona",
    name: "Verona",
    collection: "Piso Vinilico Clicado",
    desc: "Aconchego atemporal com leitura quente de madeira natural e acabamento elegante.",
    image: "https://i.imgur.com/EaLN6CV.png",
    tags: ["Aconchego", "Classico"],
  },
  {
    id: "florenca",
    name: "Florenca",
    collection: "Piso Vinilico Clicado",
    desc: "Base versatil para projetos contemporaneos que pedem leveza visual e refinamento.",
    image: "https://i.imgur.com/FtHEUuS.png",
    tags: ["Leve", "Versatil"],
  },
  {
    id: "londres",
    name: "Londres",
    collection: "Piso Vinilico Clicado",
    desc: "Leitura urbana em tons mais frios para ambientes com linguagem moderna e limpa.",
    image: "https://i.imgur.com/bDKAxLa.png",
    tags: ["Moderno", "Urbano"],
  },
  {
    id: "rio",
    name: "Rio de Janeiro",
    collection: "Piso Vinilico Clicado",
    desc: "Textura acolhedora que traz movimento e calor visual sem perder elegancia.",
    image: "https://i.imgur.com/O29ld7u.png",
    tags: ["Natural", "Calor"],
  },
  {
    id: "washington",
    name: "Washington",
    collection: "Piso Vinilico Clicado",
    desc: "Linha clara e sofisticada para quem busca amplitude e acabamento mais luminoso.",
    image: "https://i.imgur.com/UKDHwHM.png",
    tags: ["Claros", "Atemporal"],
  },
  {
    id: "shingle",
    name: "Telhas Shingle",
    collection: "Cobertura Premium",
    desc: "Protecao, desempenho termico e visual elegante para coberturas residenciais e comerciais.",
    image:
      "https://images.unsplash.com/photo-1632759145351-1d592919f522?q=80&w=2070&auto=format&fit=crop",
    tags: ["Durabilidade", "Conforto"],
  },
  {
    id: "ripado",
    name: "Ripados WPC",
    collection: "Revestimento Decorativo",
    desc: "Volume arquitetonico marcante com baixa manutencao para interiores e fachadas.",
    image:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop",
    tags: ["Design", "Baixa manutencao"],
  },
  {
    id: "rodapes",
    name: "Rodapes Poliestireno",
    collection: "Acabamento Premium",
    desc: "Arremate elegante e resistente a umidade para dar acabamento consistente ao projeto.",
    image:
      "https://images.unsplash.com/photo-1505693415957-28309913d3bb?q=80&w=2070&auto=format&fit=crop",
    tags: ["Pratico", "Resistente"],
  },
].map((product) => ({ ...product, price: "Sob consulta", status: "Ativo" })) satisfies LandingProduct[];

function normalizeProduct(product: Product): LandingProduct {
  return {
    ...product,
    desc:
      product.desc ||
      (product.price && product.price !== "Sob consulta"
        ? `Linha ${product.collection} com referencia ${product.price}.`
        : `Solucao premium da linha ${product.collection}.`),
    tags:
      Array.isArray(product.tags) && product.tags.length > 0
        ? product.tags
        : [product.status || "Ativo", "Casaboni"],
  };
}

function buildHighlights(product: LandingProduct) {
  const haystack = `${product.name} ${product.collection} ${product.desc} ${product.tags.join(" ")}`.toLowerCase();
  if (haystack.includes("telha")) return ["Alta resistencia", "Protecao termica"];
  if (haystack.includes("ripado")) return ["Presenca arquitetonica", "Baixa manutencao"];
  if (haystack.includes("rodape")) return ["Acabamento limpo", "Resistente a umidade"];
  return ["Conforto visual", "Facil manutencao"];
}

function ProductCard({ product, index }: { product: LandingProduct; index: number }) {
  const highlights = buildHighlights(product);

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(180deg,#ffffff_0%,#f7f3ed_100%)] shadow-[0_26px_80px_rgba(18,34,32,0.12)]"
    >
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-primary/78 via-primary/20 to-transparent opacity-95" />
        <img
          className="h-full w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-105"
          src={product.image}
          alt={product.name}
          referrerPolicy="no-referrer"
        />

        <div className="absolute left-5 right-5 top-5 z-20 flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-md">
              {product.collection}
            </span>
            {product.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/20 bg-primary/35 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/90 backdrop-blur-md"
              >
                {tag}
              </span>
            ))}
          </div>

          <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-md">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 p-5">
          <div className="max-w-[90%]">
            <h3 className="text-2xl font-semibold tracking-tight text-white">{product.name}</h3>
            <p className="mt-2 text-sm leading-6 text-white/82">{product.desc}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-6 p-5 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-surface-lowest p-4">
            <div className="flex items-center gap-2 text-action">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Percepcao</span>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-primary">{highlights[0]}</p>
          </div>

          <div className="rounded-2xl bg-surface-lowest p-4">
            <div className="flex items-center gap-2 text-action">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Desempenho</span>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-primary">{highlights[1]}</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-outline-variant bg-white/75 px-4 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-outline">
            <Droplets className="h-4 w-4 text-action" />
            <p className="text-xs font-bold uppercase tracking-[0.22em]">
              Atendimento consultivo e curadoria visual
            </p>
          </div>
          <ArrowUpRight className="h-5 w-5 text-action transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
      </div>
    </motion.article>
  );
}

export default function ProductSection() {
  const [currentPage, setCurrentPage] = useState(0);
  const [dbProducts, setDbProducts] = useState<LandingProduct[]>([]);
  const products = useMemo(() => (dbProducts.length > 0 ? dbProducts : fallbackProducts), [dbProducts]);
  const productsPerPageDesktop = 3;
  const totalDesktopPages = Math.max(1, Math.ceil(products.length / productsPerPageDesktop));
  const currentDesktopProducts = products.slice(
    currentPage * productsPerPageDesktop,
    (currentPage + 1) * productsPerPageDesktop
  );

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((item) => normalizeProduct({ id: item.id, ...item.data() } as Product))
          .filter((product) => product.status !== "Inativo");
        setDbProducts(data);
      },
      (error) => {
        console.warn("Public products read failed, using fallback catalog:", error);
        setDbProducts([]);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentPage >= totalDesktopPages) setCurrentPage(0);
  }, [currentPage, totalDesktopPages]);

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalDesktopPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalDesktopPages) % totalDesktopPages);

  return (
    <section className="relative overflow-hidden bg-surface py-16 md:py-24" id="produtos">
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-0 top-24 h-56 w-56 rounded-full bg-action/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-10 flex flex-col gap-6 md:mb-16 md:flex-row md:items-end md:justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl"
          >
            <span className="inline-flex rounded-full border border-action/20 bg-action/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-action">
              Curadoria visual Casaboni
            </span>
            <h2 className="mt-5 text-3xl font-semibold uppercase tracking-tight text-primary md:text-5xl">
              Linhas desenhadas para vender melhor o valor do acabamento.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-outline md:text-base">
              Refinamos os cards para que a leitura fique mais premium, mais editorial e mais alinhada
              a um posicionamento comercial de alto padrão.
            </p>
          </motion.div>

          <div className="hidden items-center gap-4 rounded-full border border-outline-variant bg-white/70 px-4 py-3 md:flex">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-outline">
              Página {currentPage + 1} de {totalDesktopPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={prevPage}
                className="rounded-full border border-outline-variant bg-surface-lowest p-2 text-primary transition-colors hover:border-action hover:text-action"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={nextPage}
                className="rounded-full border border-outline-variant bg-surface-lowest p-2 text-primary transition-colors hover:border-action hover:text-action"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="md:hidden">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">
              Deslize para explorar as linhas
            </span>
          </div>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 no-scrollbar">
            {products.map((product, index) => (
              <div key={product.id} className="min-w-[88%] snap-start">
                <ProductCard product={product} index={index} />
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:block">
          <div className="grid min-h-[680px] grid-cols-3 gap-8">
            <AnimatePresence mode="wait">
              {currentDesktopProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} index={currentPage * productsPerPageDesktop + index} />
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-10 flex justify-center gap-2">
            {Array.from({ length: totalDesktopPages }).map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPage(index)}
                className={`h-2.5 rounded-full transition-all ${
                  currentPage === index ? "w-10 bg-action" : "w-2.5 bg-outline-variant"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
