import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Calendar,
  Download,
  Edit,
  LayoutDashboard,
  LogIn,
  LogOut,
  Package,
  Search,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import readXlsxFile from "read-excel-file/browser";
import { Lead } from "../types";
import {
  auth,
  db,
  getFirebaseAuthErrorMessage,
  loginWithGoogle,
  waitForAuthBootstrap,
} from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import BrandLogo from "../components/BrandLogo";

type LeadImportRow = Omit<Lead, "id">;

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function pick(row: Record<string, any>, aliases: string[]) {
  const normalized = Object.entries(row).reduce<Record<string, any>>((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});

  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  return "";
}

function normalizeDate(value: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return value;
}

function mapRows(rows: Record<string, any>[]): LeadImportRow[] {
  return rows
    .map((row) => ({
      name: pick(row, ["nome", "name", "cliente", "contato"]),
      phone: pick(row, ["telefone", "phone", "whatsapp", "celular", "fone"]),
      email: pick(row, ["email", "e-mail"]),
      city: pick(row, ["cidade", "city"]),
      product: pick(row, ["produto", "product", "interesse", "categoria"]),
      environment: pick(row, ["ambiente", "environment", "comodo", "cômodo"]),
      area: pick(row, ["area", "área", "metragem", "m2", "m²"]),
      date: normalizeDate(pick(row, ["data", "date", "criado em", "createdAt"])),
      status: pick(row, ["status", "etapa"]) || "Novo",
      source: "import-admin-excel",
      notes: pick(row, ["observacoes", "observações", "notes", "comentarios", "comentários"]),
      createdAt: serverTimestamp(),
    }))
    .filter((lead) => lead.name || lead.phone || lead.email);
}

function rowsToObjects(rows: any[][]) {
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((row) =>
    headers.reduce<Record<string, any>>((acc, header, index) => {
      acc[String(header || `coluna_${index + 1}`)] = row[index] ?? "";
      return acc;
    }, {})
  );
}

function parseCsv(text: string) {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split(";").length > line.split(",").length ? line.split(";") : line.split(","));

  return rowsToObjects(rows);
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [previewRows, setPreviewRows] = useState<LeadImportRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.phone, lead.email, lead.city, lead.product, lead.environment, lead.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [leads, search]);

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

    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(300));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLeads(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Lead[]);
        setDbError(null);
        setLoading(false);
      },
      (error: any) => {
        console.error("Firestore leads read error:", error);
        setLoading(false);
        setDbError(
          error?.code === "permission-denied"
            ? "Seu usuário autenticado não tem permissão para ler leads."
            : "Não foi possível carregar os leads."
        );
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (error) {
      setAuthError(getFirebaseAuthErrorMessage(error));
    }
  };

  const handleFile = async (file: File) => {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const rows = isCsv
      ? parseCsv(await file.text())
      : rowsToObjects((await readXlsxFile(file)) as unknown as any[][]);

    setPreviewRows(mapRows(rows));
  };

  const importPreview = async () => {
    if (previewRows.length === 0) return;
    setImporting(true);

    try {
      const chunks: LeadImportRow[][] = [];
      for (let i = 0; i < previewRows.length; i += 450) chunks.push(previewRows.slice(i, i + 450));

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((lead) => {
          const ref = doc(collection(db, "leads"));
          batch.set(ref, lead);
        });
        await batch.commit();
      }

      setPreviewRows([]);
      if (inputRef.current) inputRef.current.value = "";
      alert("Leads importados com sucesso.");
    } catch (error: any) {
      console.error("import leads error:", error);
      alert(error?.code === "permission-denied" ? "Sem permissão para importar leads." : "Erro ao importar leads.");
    } finally {
      setImporting(false);
    }
  };

  const editLead = async (lead: Lead) => {
    const status = window.prompt("Status do lead:", lead.status || "Novo");
    if (!status?.trim()) return;
    await updateDoc(doc(db, "leads", lead.id), { status: status.trim() });
  };

  const deleteLead = async (lead: Lead) => {
    if (!window.confirm(`Excluir lead de ${lead.name || lead.phone}?`)) return;
    await deleteDoc(doc(db, "leads", lead.id));
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low uppercase tracking-widest font-bold text-outline">
        Verificando acesso...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low p-6">
        <div className="bg-white border border-outline-variant p-12 max-w-md w-full text-center shadow-ambient">
          <h2 className="text-3xl font-bold text-primary uppercase tracking-tighter mb-4">Acesso Restrito</h2>
          <p className="text-sm text-outline mb-8 uppercase tracking-widest">Faça login para gerenciar seus leads</p>
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
          <Link to="/admin/leads" className="flex items-center gap-3 p-3 bg-white/10 rounded-lg text-sm font-medium">
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
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Leads</h1>
            <p className="text-sm text-outline mt-2">Importe contatos, acompanhe status e organize oportunidades.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar leads..."
                className="pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full text-sm focus:outline-none focus:border-action w-72"
              />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-4 h-4" /> Importar Excel
            </button>
          </div>
        </header>

        {dbError && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 text-sm uppercase tracking-wider font-bold">
            {dbError}
          </div>
        )}

        {previewRows.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 bg-white border border-outline-variant shadow-ambient">
            <div className="p-5 border-b border-outline-variant flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Prévia da importação</h2>
                <p className="text-xs text-outline mt-1">{previewRows.length} contatos prontos para importar.</p>
              </div>
              <button
                onClick={importPreview}
                disabled={importing}
                className="flex items-center gap-2 bg-action text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> {importing ? "Importando..." : "Confirmar"}
              </button>
            </div>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left">
                <thead className="bg-surface-low sticky top-0">
                  <tr>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Nome</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">WhatsApp</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Produto</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Cidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {previewRows.slice(0, 20).map((lead, index) => (
                    <tr key={`${lead.phone}-${index}`}>
                      <td className="p-3 text-sm font-bold text-primary">{lead.name || "-"}</td>
                      <td className="p-3 text-xs text-outline">{lead.phone || "-"}</td>
                      <td className="p-3 text-xs text-outline">{lead.product || "-"}</td>
                      <td className="p-3 text-xs text-outline">{lead.city || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        <div className="bg-white shadow-ambient border border-outline-variant overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-lowest">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Base de Leads</h2>
            <span className="text-xs font-bold uppercase tracking-widest text-outline">Total: {filteredLeads.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-low border-b border-outline-variant">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Cliente</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Interesse</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Ambiente</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Data</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Status</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-outline">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-outline">Carregando...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-outline">Nenhum lead encontrado.</td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-surface transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-primary">{lead.name || "Sem nome"}</span>
                          <span className="text-[10px] text-outline uppercase">{lead.phone || lead.email || "-"}</span>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-medium text-primary uppercase">{lead.product || "-"}</td>
                      <td className="p-4 text-xs font-medium text-primary uppercase">{lead.environment || lead.area || "-"}</td>
                      <td className="p-4 text-xs text-outline">{lead.date || "-"}</td>
                      <td className="p-4">
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                          {lead.status || "Novo"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => void editLead(lead)} className="p-1 hover:bg-surface-high rounded transition-colors">
                            <Edit className="w-4 h-4 text-outline" />
                          </button>
                          <button onClick={() => void deleteLead(lead)} className="p-1 hover:bg-red-50 rounded transition-colors">
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
