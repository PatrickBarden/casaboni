import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Package,
  LogOut,
  Search,
  Filter,
  Calendar,
  MoreVertical,
  TrendingUp,
  CheckCircle2,
  Users,
  LogIn,
  User,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Lead } from "../types";
import {
  db,
  auth,
  getFirebaseAuthErrorMessage,
  loginWithGoogle,
  waitForAuthBootstrap,
} from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import BrandLogo from "../components/BrandLogo";

export default function AdminDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter(
      (l) =>
        (l.name || "").toLowerCase().includes(term) ||
        (l.phone || "").toLowerCase().includes(term) ||
        (l.environment || "").toLowerCase().includes(term) ||
        (l.area || "").toLowerCase().includes(term)
    );
  }, [leads, search]);

  const stats = [
    { label: "Total de Leads", value: leads.length, icon: Users, color: "text-blue-600" },
    {
      label: "Leads de Hoje",
      value: leads.filter((l) => l.date === new Date().toISOString().split("T")[0]).length,
      icon: TrendingUp,
      color: "text-green-600",
    },
    { label: "Taxa de Conversão", value: "24%", icon: CheckCircle2, color: "text-orange-600" },
  ];

  const editLeadStatus = async (lead: Lead) => {
    const status = window.prompt("Status do lead (Novo, Em Atendimento, Fechado):", lead.status || "Novo");
    if (!status?.trim()) return;
    try {
      await updateDoc(doc(db, "leads", lead.id), { status: status.trim() });
      alert("Lead atualizado.");
    } catch (error: any) {
      console.error("update lead error:", error);
      alert(error?.code === "permission-denied" ? "Sem permissão para atualizar lead." : "Erro ao atualizar lead.");
    }
  };

  const deleteLeadById = async (lead: Lead) => {
    if (!window.confirm(`Excluir lead de ${lead.name}?`)) return;
    try {
      await deleteDoc(doc(db, "leads", lead.id));
      alert("Lead excluído.");
    } catch (error: any) {
      console.error("delete lead error:", error);
      alert(error?.code === "permission-denied" ? "Sem permissão para excluir lead." : "Erro ao excluir lead.");
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

    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(30));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Lead[];
        setLeads(data);
        setDbError(null);
        setLoading(false);
      },
      (error: any) => {
        console.error("Firestore leads read error:", error);
        setLoading(false);
        if (error?.code === "permission-denied") {
          setDbError("Seu usuário autenticado não tem permissão de admin para ler leads.");
          return;
        }
        setDbError("Não foi possível carregar os leads. Verifique a configuração do Firebase.");
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
            Faça login para gerenciar seus leads
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
          <Link to="/admin" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </Link>
          <Link to="/admin/leads" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Users className="w-5 h-5" /> Leads
          </Link>
          <Link to="/admin/meetings" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Calendar className="w-5 h-5" /> Reuniões
          </Link>
          <Link to="/admin/products" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
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
          <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Dashboard de Leads</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar leads..."
                className="pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-64"
              />
            </div>
            <button className="p-2 bg-white border border-outline-variant rounded-full hover:bg-surface transition-colors">
              <Filter className="w-5 h-5 text-primary" />
            </button>
          </div>
        </header>

        {dbError && (
          <div className="mb-8 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 text-sm uppercase tracking-wider font-bold">
            {dbError}
          </div>
        )}

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

        <div className="bg-white shadow-ambient border border-outline-variant overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-lowest">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Leads Recentes</h2>
            <span className="text-xs font-bold uppercase tracking-widest text-outline">Total: {filteredLeads.length}</span>
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
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-outline">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-outline">
                      Nenhum lead encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
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
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                            lead.status === "Novo"
                              ? "bg-blue-100 text-blue-700"
                              : lead.status === "Em Atendimento"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => editLeadStatus(lead)} className="p-1 hover:bg-surface-high rounded transition-colors">
                            <MoreVertical className="w-4 h-4 text-outline" />
                          </button>
                          <button onClick={() => deleteLeadById(lead)} className="p-1 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4 text-outline hover:text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
