import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { LayoutDashboard, Package, LogOut, Search, Filter, Calendar, MoreVertical, TrendingUp, CheckCircle2, Users, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { Lead } from "../types";
import { db, auth, loginWithGoogle, handleFirestoreError, OperationType } from "../firebase";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function AdminDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const path = "leads";
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(10));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];
      setLeads(leadsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const stats = [
    { label: "Total de Leads", value: leads.length, icon: Users, color: "text-blue-600" },
    { label: "Leads de Hoje", value: leads.filter(l => l.date === new Date().toISOString().split("T")[0]).length, icon: TrendingUp, color: "text-green-600" },
    { label: "Taxa de Conversão", value: "24%", icon: CheckCircle2, color: "text-orange-600" },
  ];

  if (authChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-surface-low uppercase tracking-widest font-bold text-outline">Verificando acesso...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low p-6">
        <div className="bg-white border border-outline-variant p-12 max-w-md w-full text-center shadow-ambient">
          <h2 className="text-3xl font-bold text-primary uppercase tracking-tighter mb-4">Acesso Restrito</h2>
          <p className="text-sm text-outline mb-8 uppercase tracking-widest">Faça login para gerenciar seus leads</p>
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
          <Link to="/admin" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </Link>
          <Link to="/admin/meetings" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Calendar className="w-5 h-5" /> Reuniões
          </Link>
          <Link to="/admin/products" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
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
          <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Dashboard de Leads</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input 
                type="text" 
                placeholder="Pesquisar leads..." 
                className="pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-64"
              />
            </div>
            <button className="p-2 bg-white border border-outline-variant rounded-full hover:bg-surface transition-colors">
              <Filter className="w-5 h-5 text-primary" />
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {stats.map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-8 shadow-ambient border border-outline-variant flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-outline mb-2">{stat.label}</p>
                <p className="text-4xl font-bold text-primary">{stat.value}</p>
              </div>
              <stat.icon className={`w-12 h-12 ${stat.color} opacity-20`} />
            </motion.div>
          ))}
        </div>

        {/* Leads Table */}
        <div className="bg-white shadow-ambient border border-outline-variant overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-lowest">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Leads Recentes</h2>
            <button className="text-xs font-bold uppercase tracking-widest text-action hover:underline">Ver todos</button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-low border-b border-outline-variant">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Cliente</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Ambiente</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Área</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Data</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Status</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr><td colSpan={6} className="p-10 text-center text-outline">Carregando...</td></tr>
                ) : leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-surface transition-colors">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-primary">{lead.name}</span>
                        <span className="text-[10px] text-outline uppercase">{lead.phone}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-medium text-primary uppercase">{lead.environment}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-medium text-primary uppercase">{lead.area}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs text-outline">{lead.date}</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        lead.status === 'Novo' ? 'bg-blue-100 text-blue-700' :
                        lead.status === 'Em Atendimento' ? 'bg-orange-100 text-orange-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button className="p-1 hover:bg-surface-high rounded transition-colors">
                        <MoreVertical className="w-4 h-4 text-outline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
