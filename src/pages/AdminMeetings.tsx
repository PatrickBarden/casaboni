import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Calendar, LayoutDashboard, Package, LogOut, Search, Filter, MoreVertical, Clock, User, Mail, Phone, Edit, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { Meeting } from "../types";
import { db, auth, loginWithGoogle, handleFirestoreError, OperationType } from "../firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function AdminMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
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

    const path = "meetings";
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meetingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Meeting[];
      setMeetings(meetingsData);
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
          <p className="text-sm text-outline mb-8 uppercase tracking-widest">Faça login para gerenciar suas reuniões</p>
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
          <Link to="/admin/meetings" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium transition-colors">
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
          <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Agenda de Reuniões</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input 
                type="text" 
                placeholder="Pesquisar reuniões..." 
                className="pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-64"
              />
            </div>
          </div>
        </header>

        {/* Meetings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {loading ? (
            <div className="col-span-full py-20 text-center text-outline uppercase tracking-widest font-bold">Carregando agenda...</div>
          ) : meetings.map((meeting, i) => (
            <motion.div 
              key={meeting.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white border border-outline-variant shadow-ambient p-8 flex flex-col relative group"
            >
              <div className="absolute top-8 right-8">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  meeting.status === 'Agendada' ? 'bg-blue-100 text-blue-700' :
                  meeting.status === 'Concluída' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {meeting.status}
                </span>
              </div>

              <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 bg-surface-low rounded-full flex items-center justify-center text-primary">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary uppercase tracking-tighter mb-1">{meeting.customerName}</h3>
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
                <button className="text-xs font-bold uppercase tracking-widest text-action hover:underline">Detalhes da Consultoria</button>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-surface-high rounded transition-colors text-outline">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="p-2 hover:bg-surface-high rounded transition-colors text-outline">
                    <MoreVertical className="w-4 h-4" />
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
