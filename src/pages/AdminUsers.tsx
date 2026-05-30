import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Package,
  LogOut,
  Search,
  Calendar,
  LogIn,
  User,
  Plus,
  Edit,
  Trash2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AdminUser } from "../types";
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
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import BrandLogo from "../components/BrandLogo";

function normalizeRole(role: string): AdminUser["role"] {
  const value = role.toLowerCase();
  if (value.includes("admin")) return "admin";
  if (value.includes("view")) return "viewer";
  return "sales";
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(term) ||
        (u.name || "").toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term)
    );
  }, [users, search]);

  const createUser = async () => {
    const uid = window.prompt("UID do usuário (Firebase Auth):");
    if (!uid?.trim()) return;
    const email = window.prompt("E-mail do usuário:");
    if (!email?.trim()) return;
    const name = window.prompt("Nome do usuário:", "") || "";
    const role = normalizeRole(window.prompt("Perfil (admin/sales/viewer):", "sales") || "sales");

    try {
      await setDoc(
        doc(db, "users", uid.trim()),
        {
          email: email.trim(),
          name: name.trim(),
          role,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Usuário salvo/atualizado com sucesso.");
    } catch (error: any) {
      console.error("create user error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para criar usuário."
          : "Erro ao criar usuário."
      );
    }
  };

  const editUser = async (userRow: AdminUser) => {
    const name = window.prompt("Nome:", userRow.name || "") || userRow.name || "";
    const email = window.prompt("E-mail:", userRow.email || "") || userRow.email || "";
    const role = normalizeRole(
      window.prompt("Perfil (admin/sales/viewer):", userRow.role || "sales") || userRow.role
    );
    try {
      await updateDoc(doc(db, "users", userRow.id), {
        name: name.trim(),
        email: email.trim(),
        role,
      });
      alert("Usuário atualizado.");
    } catch (error: any) {
      console.error("edit user error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para editar usuário."
          : "Erro ao editar usuário."
      );
    }
  };

  const deleteUserById = async (userRow: AdminUser) => {
    if (!window.confirm(`Excluir usuário ${userRow.email || userRow.id}?`)) return;
    try {
      await deleteDoc(doc(db, "users", userRow.id));
      alert("Usuário excluído.");
    } catch (error: any) {
      console.error("delete user error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para excluir usuário."
          : "Erro ao excluir usuário."
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

    const q = query(collection(db, "users"), orderBy("email", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AdminUser[];
        setUsers(data);
        setDbError(null);
        setLoading(false);
      },
      (error: any) => {
        console.error("Firestore users read error:", error);
        setLoading(false);
        if (error?.code === "permission-denied") {
          setDbError("Seu usuário autenticado não tem permissão de admin para ler usuários.");
          return;
        }
        setDbError("Não foi possível carregar os usuários. Verifique a configuração do Firebase.");
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
            Faça login para gerenciar usuários
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
          <Link to="/admin/leads" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Users className="w-5 h-5" /> Leads
          </Link>
          <Link to="/admin/meetings" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Calendar className="w-5 h-5" /> Reuniões
          </Link>
          <Link to="/admin/products" className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Package className="w-5 h-5" /> Produtos
          </Link>
          <Link to="/admin/users" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium transition-colors">
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
          <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Gerenciamento de Usuários</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar usuários..."
                className="pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-64"
              />
            </div>
            <button
              onClick={createUser}
              className="px-5 py-2 bg-action text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-[#c96a2b] transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo Usuário
            </button>
          </div>
        </header>

        {dbError && (
          <div className="mb-8 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 text-sm uppercase tracking-wider font-bold">
            {dbError}
          </div>
        )}

        <div className="bg-white shadow-ambient border border-outline-variant overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-lowest">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Usuários do Sistema</h2>
            <span className="text-xs font-bold uppercase tracking-widest text-outline">Total: {filteredUsers.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-low border-b border-outline-variant">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">UID</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Nome</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">E-mail</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Perfil</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-outline">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-outline">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((row, i) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-surface transition-colors"
                    >
                      <td className="p-4 text-[11px] text-outline">{row.id}</td>
                      <td className="p-4 text-sm font-medium text-primary">{row.name || "-"}</td>
                      <td className="p-4 text-sm text-primary">{row.email || "-"}</td>
                      <td className="p-4">
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-low text-primary">
                          {row.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editUser(row)}
                            className="p-2 hover:bg-surface-high rounded transition-colors text-outline"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteUserById(row)}
                            className="p-2 hover:bg-red-50 rounded transition-colors text-outline hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
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
