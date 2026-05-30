import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Calendar,
  LayoutDashboard,
  Package,
  LogOut,
  Search,
  MoreVertical,
  Clock,
  User,
  Mail,
  Phone,
  Edit,
  LogIn,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Meeting } from "../types";
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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import BrandLogo from "../components/BrandLogo";

type MeetingStatus = "Agendada" | "Concluída" | "Cancelada";

function normalizeMeetingStatus(raw: string): MeetingStatus {
  const value = raw.toLowerCase();
  if (value.includes("cancel")) return "Cancelada";
  if (value.includes("concl")) return "Concluída";
  return "Agendada";
}

export default function AdminMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const filteredMeetings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return meetings;
    return meetings.filter(
      (m) =>
        (m.customerName || "").toLowerCase().includes(term) ||
        (m.customerEmail || "").toLowerCase().includes(term) ||
        (m.phone || "").toLowerCase().includes(term) ||
        (m.topic || "").toLowerCase().includes(term)
    );
  }, [meetings, search]);

  const createMeeting = async () => {
    const customerName = window.prompt("Nome do cliente:");
    if (!customerName?.trim()) return;
    const customerEmail = window.prompt("E-mail do cliente:");
    if (!customerEmail?.trim()) return;
    const phone = window.prompt("Telefone:", "(11) 90000-0000") || "";
    const date = window.prompt("Data (YYYY-MM-DD):", new Date().toISOString().slice(0, 10)) || "";
    const time = window.prompt("Horário (HH:MM):", "14:00") || "";
    const topic = window.prompt("Assunto:", "Consultoria Técnica") || "Consultoria Técnica";
    const status = normalizeMeetingStatus(window.prompt("Status (Agendada/Concluída/Cancelada):", "Agendada") || "Agendada");

    try {
      await addDoc(collection(db, "meetings"), {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        phone: phone.trim(),
        date: date.trim(),
        time: time.trim(),
        topic: topic.trim(),
        status,
        source: "admin-panel",
        createdAt: serverTimestamp(),
      });
      alert("Reunião criada com sucesso.");
    } catch (error: any) {
      console.error("create meeting error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para criar reunião."
          : "Erro ao criar reunião."
      );
    }
  };

  const editMeeting = async (meeting: Meeting) => {
    const date = window.prompt("Data (YYYY-MM-DD):", meeting.date || "") || meeting.date;
    const time = window.prompt("Horário (HH:MM):", meeting.time || "") || meeting.time;
    const topic = window.prompt("Assunto:", meeting.topic || "Consultoria Técnica") || meeting.topic;
    const status = normalizeMeetingStatus(
      window.prompt("Status (Agendada/Concluída/Cancelada):", meeting.status || "Agendada") ||
        meeting.status
    );

    try {
      await updateDoc(doc(db, "meetings", meeting.id), {
        date: date.trim(),
        time: time.trim(),
        topic: topic.trim(),
        status,
      });
      alert("Reunião atualizada.");
    } catch (error: any) {
      console.error("edit meeting error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para editar reunião."
          : "Erro ao editar reunião."
      );
    }
  };

  const deleteMeetingById = async (meeting: Meeting) => {
    const confirmed = window.confirm(`Excluir reunião de ${meeting.customerName}?`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "meetings", meeting.id));
      alert("Reunião excluída.");
    } catch (error: any) {
      console.error("delete meeting error:", error);
      alert(
        error?.code === "permission-denied"
          ? "Sem permissão para excluir reunião."
          : "Erro ao excluir reunião."
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

    const q = query(collection(db, "meetings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const meetingsData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Meeting[];
        setMeetings(meetingsData);
        setDbError(null);
        setLoading(false);
      },
      (error: any) => {
        console.error("Firestore meetings read error:", error);
        setLoading(false);
        if (error?.code === "permission-denied") {
          setDbError("Seu usuário autenticado não tem permissão de admin para ler reuniões.");
          return;
        }
        setDbError("Não foi possível carregar as reuniões. Verifique a configuração do Firebase.");
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
            Faça login para gerenciar suas reuniões
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
          <Link to="/admin/meetings" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium transition-colors">
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
          <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Agenda de Reuniões</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar reuniões..."
                className="pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-64"
              />
            </div>
            <button
              onClick={createMeeting}
              className="px-5 py-2 bg-action text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-[#c96a2b] transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova Reunião
            </button>
          </div>
        </header>

        {dbError && (
          <div className="mb-8 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 text-sm uppercase tracking-wider font-bold">
            {dbError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {loading ? (
            <div className="col-span-full py-20 text-center text-outline uppercase tracking-widest font-bold">
              Carregando agenda...
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="col-span-full py-20 text-center text-outline uppercase tracking-widest font-bold">
              Nenhuma reunião encontrada
            </div>
          ) : (
            filteredMeetings.map((meeting, i) => (
              <motion.div
                key={meeting.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-white border border-outline-variant shadow-ambient p-8 flex flex-col relative group"
              >
                <div className="absolute top-8 right-8">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      meeting.status === "Agendada"
                        ? "bg-blue-100 text-blue-700"
                        : meeting.status === "Concluída"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {meeting.status}
                  </span>
                </div>

                <div className="flex items-start gap-6 mb-8">
                  <div className="w-16 h-16 bg-surface-low rounded-full flex items-center justify-center text-primary">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-primary uppercase tracking-tighter mb-1">
                      {meeting.customerName}
                    </h3>
                    <p className="text-xs text-outline uppercase tracking-widest font-medium">{meeting.topic}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="flex items-center gap-3 text-sm text-primary">
                    <Calendar className="w-5 h-5 text-action" />
                    <span className="font-medium">{meeting.date}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-primary">
                    <Clock className="w-5 h-5 text-action" />
                    <span className="font-medium">{meeting.time}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-primary">
                    <Mail className="w-5 h-5 text-action" />
                    <span className="font-medium truncate">{meeting.customerEmail}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-primary">
                    <Phone className="w-5 h-5 text-action" />
                    <span className="font-medium">{meeting.phone}</span>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-outline-variant flex justify-between items-center">
                  <button
                    onClick={() => editMeeting(meeting)}
                    className="text-xs font-bold uppercase tracking-widest text-action hover:underline"
                  >
                    Editar Reunião
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editMeeting(meeting)}
                      className="p-2 hover:bg-surface-high rounded transition-colors text-outline"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-2 hover:bg-surface-high rounded transition-colors text-outline">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteMeetingById(meeting)}
                      className="p-2 hover:bg-red-50 rounded transition-colors text-outline hover:text-red-600"
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
