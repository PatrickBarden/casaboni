import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { LayoutDashboard, Package, LogOut, Search, Filter, Plus, Edit, Trash2, Copy, Eye, Calendar, LogIn, Database } from "lucide-react";
import { Link } from "react-router-dom";
import { Product } from "../types";
import { db, auth, loginWithGoogle, handleFirestoreError, OperationType } from "../firebase";
import { collection, onSnapshot, query, orderBy, addDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

const SEED_PRODUCTS = [
  { name: "Veneza", collection: "Piso Vinílico Clicado", price: "R$ 189,90/m²", status: "Ativo", image: "https://i.imgur.com/KASG7HZ.png" },
  { name: "Verona", collection: "Piso Vinílico Clicado", price: "R$ 179,90/m²", status: "Ativo", image: "https://i.imgur.com/EaLN6CV.png" },
  { name: "Florença", collection: "Piso Vinílico Clicado", price: "R$ 195,00/m²", status: "Ativo", image: "https://i.imgur.com/FtHEUuS.png" },
  { name: "Londres", collection: "Piso Vinílico Clicado", price: "R$ 185,00/m²", status: "Ativo", image: "https://i.imgur.com/bDKAxLa.png" },
  { name: "Rio de Janeiro", collection: "Piso Vinílico Clicado", price: "R$ 169,90/m²", status: "Ativo", image: "https://i.imgur.com/O29ld7u.png" },
  { name: "Washington", collection: "Piso Vinílico Clicado", price: "R$ 189,90/m²", status: "Ativo", image: "https://i.imgur.com/UKDHwHM.png" },
  { name: "Telhas Shingle", collection: "Cobertura Premium", price: "Sob consulta", status: "Ativo", image: "https://images.unsplash.com/photo-1632759145351-1d592919f522?q=80&w=2070&auto=format&fit=crop" },
  { name: "Ripados WPC", collection: "Revestimento Decorativo", price: "R$ 120,00/m", status: "Ativo", image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop" },
  { name: "Rodapés Poliestireno", collection: "Acabamento Premium", price: "R$ 45,00/m", status: "Ativo", image: "https://images.unsplash.com/photo-1505693415957-28309913d3bb?q=80&w=2070&auto=format&fit=crop" }
];

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const seedDatabase = async () => {
    if (!window.confirm("Deseja popular o banco de dados com os produtos padrão da Casaboni?")) return;
    
    setSeeding(true);
    try {
      const path = "products";
      const colRef = collection(db, path);
      
      // Check if already has products to avoid duplicates if user wants
      const existing = await getDocs(colRef);
      if (existing.size > 0) {
        if (!window.confirm("O banco já possui produtos. Deseja adicionar os padrões mesmo assim?")) {
          setSeeding(false);
          return;
        }
      }

      for (const p of SEED_PRODUCTS) {
        await addDoc(colRef, p);
      }
      alert("Banco de dados populado com sucesso!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "products");
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const path = "products";
    const q = query(collection(db, path), orderBy("name", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  if (authChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-surface-low uppercase tracking-widest font-bold text-outline">Verificando acesso...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low p-6">
        <div className="bg-white border border-outline-variant p-12 max-w-md w-full text-center shadow-ambient">
          <h2 className="text-3xl font-bold text-primary uppercase tracking-tighter mb-4">Acesso Restrito</h2>
          <p className="text-sm text-outline mb-8 uppercase tracking-widest">Faça login para gerenciar seus produtos</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-primary text-white py-4 font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-5 h-5" /> Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  const handleSignOut = () => signOut(auth);

  return (
    <div className="min-h-screen bg-surface-low flex">
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-white flex flex-col fixed h-full">
        <div className="p-8 border-b border-white/10">
          <span className="text-xl font-bold tracking-tighter uppercase">Casaboni</span>
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest">Admin Panel</p>
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
        </nav>

        <div className="p-6 border-t border-white/10">
          <button 
            onClick={handleSignOut}
            className="flex items-center gap-3 p-3 text-zinc-400 hover:text-white transition-colors text-sm font-medium w-full"
          >
            <LogOut className="w-5 h-5" /> Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
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
            <button className="px-6 py-2 bg-action text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-[#c96a2b] transition-colors">
              <Plus className="w-4 h-4" /> Novo Produto
            </button>
          </div>
        </header>

        {/* Filters and Search */}
        <div className="bg-white p-6 shadow-ambient border border-outline-variant mb-8 flex justify-between items-center">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input 
                type="text" 
                placeholder="Pesquisar produtos..." 
                className="pl-10 pr-4 py-2 bg-surface-low border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-full"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-full text-xs font-bold uppercase tracking-widest text-primary hover:bg-surface transition-colors">
              <Filter className="w-4 h-4" /> Filtros
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-outline">Ordenar por:</span>
            <select className="bg-transparent text-xs font-bold uppercase tracking-widest text-primary focus:outline-none cursor-pointer">
              <option>Mais recentes</option>
              <option>Preço: Menor - Maior</option>
              <option>Preço: Maior - Menor</option>
            </select>
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full py-20 text-center text-outline uppercase tracking-widest font-bold">Carregando catálogo...</div>
          ) : products.map((product, i) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
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
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    product.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-700'
                  }`}>
                    {product.status}
                  </span>
                </div>
                <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button className="p-3 bg-white text-primary rounded-full hover:bg-action hover:text-white transition-colors">
                    <Eye className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-white text-primary rounded-full hover:bg-action hover:text-white transition-colors">
                    <Edit className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-white text-primary rounded-full hover:bg-action hover:text-white transition-colors">
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-primary uppercase tracking-tighter">{product.name}</h3>
                  <span className="text-action font-bold text-sm">{product.price}</span>
                </div>
                <p className="text-xs text-outline uppercase tracking-widest font-medium mb-6">{product.collection}</p>
                
                <div className="mt-auto pt-6 border-t border-outline-variant flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-outline">Em estoque</span>
                  </div>
                  <button className="p-2 text-outline hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
