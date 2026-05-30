import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Package,
  LogOut,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  Calendar,
  LogIn,
  Database,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Product } from "../types";
import {
  db,
  auth,
  getFirebaseAuthErrorMessage,
  loginWithGoogle,
  waitForAuthBootstrap,
} from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import BrandLogo from "../components/BrandLogo";

const SEED_PRODUCTS = [
  {
    name: "Veneza",
    collection: "Piso Vinílico Clicado",
    price: "R$ 189,90/m²",
    status: "Ativo",
    image: "https://i.imgur.com/KASG7HZ.png",
  },
  {
    name: "Verona",
    collection: "Piso Vinílico Clicado",
    price: "R$ 179,90/m²",
    status: "Ativo",
    image: "https://i.imgur.com/EaLN6CV.png",
  },
  {
    name: "Florença",
    collection: "Piso Vinílico Clicado",
    price: "R$ 195,00/m²",
    status: "Ativo",
    image: "https://i.imgur.com/FtHEUuS.png",
  },
  {
    name: "Londres",
    collection: "Piso Vinílico Clicado",
    price: "R$ 185,00/m²",
    status: "Ativo",
    image: "https://i.imgur.com/bDKAxLa.png",
  },
  {
    name: "Rio de Janeiro",
    collection: "Piso Vinílico Clicado",
    price: "R$ 169,90/m²",
    status: "Ativo",
    image: "https://i.imgur.com/O29ld7u.png",
  },
  {
    name: "Washington",
    collection: "Piso Vinílico Clicado",
    price: "R$ 189,90/m²",
    status: "Ativo",
    image: "https://i.imgur.com/UKDHwHM.png",
  },
  {
    name: "Telhas Shingle",
    collection: "Cobertura Premium",
    price: "Sob consulta",
    status: "Ativo",
    image:
      "https://images.unsplash.com/photo-1632759145351-1d592919f522?q=80&w=2070&auto=format&fit=crop",
  },
  {
    name: "Ripados WPC",
    collection: "Revestimento Decorativo",
    price: "R$ 120,00/m",
    status: "Ativo",
    image:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop",
  },
  {
    name: "Rodapés Poliestireno",
    collection: "Acabamento Premium",
    price: "R$ 45,00/m",
    status: "Ativo",
    image:
      "https://images.unsplash.com/photo-1505693415957-28309913d3bb?q=80&w=2070&auto=format&fit=crop",
  },
];

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?q=80&w=1600&auto=format&fit=crop";

function sanitizeStatus(raw: string) {
  return raw.toLowerCase().includes("inativo") ? "Inativo" : "Ativo";
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.collection.toLowerCase().includes(term) ||
        p.price.toLowerCase().includes(term)
    );
  }, [products, search]);

  const seedDatabase = async () => {
    if (!window.confirm("Deseja popular o banco de dados com os produtos padrão da Casaboni?")) return;
    setSeeding(true);
    try {
      const colRef = collection(db, "products");
      const existing = await getDocs(colRef);
      if (existing.size > 0) {
        const shouldAppend = window.confirm(
          "O banco já possui produtos. Deseja adicionar os padrões mesmo assim?"
        );
        if (!shouldAppend) {
          setSeeding(false);
          return;
        }
      }
      for (const p of SEED_PRODUCTS) {
        await addDoc(colRef, p);
      }
      alert("Produtos populados com sucesso.");
    } catch (error: any) {
      console.error("Firestore products seed error:", error);
      if (error?.code === "permission-denied") {
        alert("Sem permissão para criar produtos. Faça login com usuário admin.");
      } else {
        alert("Erro ao popular produtos. Verifique a configuração do Firebase.");
      }
    } finally {
      setSeeding(false);
    }
  };

  const createProduct = async () => {
    const name = window.prompt("Nome do produto:");
    if (!name?.trim()) return;
    const collectionName = window.prompt("Coleção/Categoria:", "Piso Vinílico Clicado") || "";
    const price = window.prompt("Preço:", "Sob consulta") || "Sob consulta";
    const status = sanitizeStatus(window.prompt("Status (Ativo/Inativo):", "Ativo") || "Ativo");
    const image = window.prompt("URL da imagem:", DEFAULT_IMAGE) || DEFAULT_IMAGE;

    try {
      await addDoc(collection(db, "products"), {
        name: name.trim(),
        collection: collectionName.trim() || "Acabamento Premium",
        price: price.trim(),
        status,
        image: image.trim(),
      });
      alert("Produto criado com sucesso.");
    } catch (error: any) {
      console.error("create product error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para criar produto."
          : "Erro ao criar produto."
      );
    }
  };

  const editProduct = async (product: Product) => {
    const name = window.prompt("Nome do produto:", product.name);
    if (!name?.trim()) return;
    const collectionName = window.prompt("Coleção/Categoria:", product.collection) || product.collection;
    const price = window.prompt("Preço:", product.price) || product.price;
    const status = sanitizeStatus(window.prompt("Status (Ativo/Inativo):", product.status) || product.status);
    const image = window.prompt("URL da imagem:", product.image) || product.image;

    try {
      await updateDoc(doc(db, "products", product.id), {
        name: name.trim(),
        collection: collectionName.trim(),
        price: price.trim(),
        status,
        image: image.trim(),
      });
      alert("Produto atualizado.");
    } catch (error: any) {
      console.error("edit product error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para editar produto."
          : "Erro ao editar produto."
      );
    }
  };

  const duplicateProduct = async (product: Product) => {
    try {
      await addDoc(collection(db, "products"), {
        ...product,
        name: `${product.name} (Cópia)`,
      });
      alert("Produto duplicado.");
    } catch (error: any) {
      console.error("duplicate product error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para duplicar produto."
          : "Erro ao duplicar produto."
      );
    }
  };

  const deleteProductById = async (product: Product) => {
    const confirmed = window.confirm(`Excluir o produto "${product.name}"?`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "products", product.id));
      alert("Produto excluído.");
    } catch (error: any) {
      console.error("delete product error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para excluir produto."
          : "Erro ao excluir produto."
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribeAuth: (() => void) | undefined;

    const initAuth = async () => {
      await waitForAuthBootstrap();
      if (cancelled) return;
      unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthChecking(false);
      });
    };

    initAuth();
    return () => {
      cancelled = true;
      unsubscribeAuth?.();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "products"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const productsData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[];
        setProducts(productsData);
        setDbError(null);
        setLoading(false);
      },
      (error: any) => {
        console.error("Firestore products read error:", error);
        setLoading(false);
        if (error?.code === "permission-denied") {
          setDbError("Seu usuário autenticado não tem permissão de admin para ler produtos.");
          return;
        }
        setDbError("Não foi possível carregar os produtos. Verifique a configuração do Firebase.");
      }
    );

    return () => unsubscribe();
  }, [user]);

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low uppercase tracking-widest font-bold text-outline">
        Verificando acesso...
      </div>
    );
  }

  if (!user) {
    const handleLogin = async () => {
      setAuthError(null);
      try {
        await loginWithGoogle();
      } catch (error) {
        setAuthError(getFirebaseAuthErrorMessage(error));
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low p-6">
        <div className="bg-white border border-outline-variant p-12 max-w-md w-full text-center shadow-ambient">
          <h2 className="text-3xl font-bold text-primary uppercase tracking-tighter mb-4">Acesso Restrito</h2>
          <p className="text-sm text-outline mb-8 uppercase tracking-widest">
            Faça login para gerenciar seus produtos
          </p>
          {authError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 mb-4 uppercase tracking-wide">
              {authError}
            </p>
          )}
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-primary text-white py-4 font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-5 h-5" /> Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-low flex">
      <aside className="w-64 bg-primary text-white flex flex-col fixed h-full">
        <div className="p-8 border-b border-white/10">
          <BrandLogo subtitle="Admin Panel" light compact />
        </div>

        <nav className="flex-1 p-6 space-y-2">
          <Link to="/admin" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </Link>
          <Link to="/admin/meetings" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Calendar className="w-5 h-5" /> Reuniões
          </Link>
          <Link to="/admin/products" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium">
            <Package className="w-5 h-5" /> Produtos
          </Link>
          <Link to="/admin/users" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <User className="w-5 h-5" /> Usuários
          </Link>
        </nav>

        <div className="p-6 border-t border-white/10">
          <button
            onClick={() => signOut(auth)}
            className="flex items-center gap-3 p-3 text-zinc-400 hover:text-white transition-colors text-sm font-medium w-full"
          >
            <LogOut className="w-5 h-5" /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-10">
        <header className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Gerenciamento de Produtos</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={seedDatabase}
              disabled={seeding}
              className="px-6 py-2 border border-action text-action font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-action hover:text-white transition-colors disabled:opacity-50"
            >
              <Database className="w-4 h-4" /> {seeding ? "Populando..." : "Popular Banco"}
            </button>
            <button
              onClick={createProduct}
              className="px-6 py-2 bg-action text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-[#c96a2b] transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo Produto
            </button>
          </div>
        </header>

        {dbError && (
          <div className="mb-8 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 text-sm uppercase tracking-wider font-bold">
            {dbError}
          </div>
        )}

        <div className="bg-white p-6 shadow-ambient border border-outline-variant mb-8 flex justify-between items-center">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar produtos..."
                className="pl-10 pr-4 py-2 bg-surface-low border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-full"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-full text-xs font-bold uppercase tracking-widest text-primary hover:bg-surface transition-colors">
              <Filter className="w-4 h-4" /> Filtros
            </button>
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-outline">
            Total: {filteredProducts.length}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full py-20 text-center text-outline uppercase tracking-widest font-bold">
              Carregando catálogo...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full py-20 text-center text-outline uppercase tracking-widest font-bold">
              Nenhum produto encontrado
            </div>
          ) : (
            filteredProducts.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white border border-outline-variant shadow-ambient group overflow-hidden flex flex-col"
              >
                <div className="relative aspect-video overflow-hidden bg-surface-low">
                  <img
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    src={product.image}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-4 right-4">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        product.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {product.status}
                    </span>
                  </div>
                  <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button className="p-3 bg-white text-primary rounded-full hover:bg-action hover:text-white transition-colors">
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => editProduct(product)}
                      className="p-3 bg-white text-primary rounded-full hover:bg-action hover:text-white transition-colors"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => duplicateProduct(product)}
                      className="p-3 bg-white text-primary rounded-full hover:bg-action hover:text-white transition-colors"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-primary uppercase tracking-tighter">{product.name}</h3>
                    <span className="text-action font-bold text-sm">{product.price}</span>
                  </div>
                  <p className="text-xs text-outline uppercase tracking-widest font-medium mb-6">
                    {product.collection}
                  </p>

                  <div className="mt-auto pt-6 border-t border-outline-variant flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${product.status === "Ativo" ? "bg-green-500" : "bg-zinc-400"}`}></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                        {product.status === "Ativo" ? "Em estoque" : "Indisponível"}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteProductById(product)}
                      className="p-2 text-outline hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
