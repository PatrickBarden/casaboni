import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  BadgeCheck,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
  Users,
  X,
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

const IMPORT_SOURCE = "imported-list";
const SITE_SOURCE_LABEL = "Site";
const IMPORT_SOURCE_LABEL = "Importado";
const PAGE_SIZE = 24;

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

function cleanPhone(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeDate(value: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rowsToObjects(rows);
}

function rowsToObjects(rows: any[][]) {
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((row) =>
    headers.reduce<Record<string, any>>((acc, header, index) => {
      acc[String(header || `coluna_${index + 1}`).replace(/^\uFEFF/, "")] = row[index] ?? "";
      return acc;
    }, {})
  );
}

function mapRows(rows: Record<string, any>[]): LeadImportRow[] {
  const importBatch = `import-${new Date().toISOString().slice(0, 10)}`;

  return rows
    .map((row) => {
      const cnpj = cleanPhone(pick(row, ["cnpj"]));
      const companyName = pick(row, ["empresa", "razao social", "razão social"]);
      const tradeName = pick(row, ["nome fantasia", "fantasia"]);
      const ownerName = pick(row, ["proprietario/socio", "proprietário/sócio", "socio", "sócio", "contato"]);
      const whatsappSuggested = cleanPhone(pick(row, ["whatsapp sugerido", "whatsapp"]));
      const mobile = cleanPhone(pick(row, ["celular"]));
      const ddd = cleanPhone(pick(row, ["ddd"]));
      const phone = whatsappSuggested || mobile || `${ddd}${cleanPhone(pick(row, ["telefone", "phone"]))}`;
      const recommendedProduct = pick(row, ["produto/abordagem indicada", "produto", "interesse"]);
      const filterReason = pick(row, ["motivo do filtro a+++", "motivo", "observacoes", "observações"]);

      return {
        name: tradeName || companyName || ownerName,
        phone,
        email: pick(row, ["email", "e-mail"]),
        city: pick(row, ["cidade", "city"]),
        uf: pick(row, ["uf", "estado"]),
        product: recommendedProduct,
        recommendedProduct,
        environment: pick(row, ["segmento estrategico", "segmento estratégico", "ambiente"]),
        area: "",
        date: new Date().toISOString().slice(0, 10),
        status: "Novo",
        source: IMPORT_SOURCE,
        sourceLabel: IMPORT_SOURCE_LABEL,
        leadOrigin: "imported" as const,
        notes: filterReason,
        rank: pick(row, ["rank"]),
        classification: pick(row, ["classificacao", "classificação"]),
        score: pick(row, ["score a+++", "score"]),
        segment: pick(row, ["segmento estrategico", "segmento estratégico"]),
        filterReason,
        cnpj,
        companyName,
        tradeName,
        cnaeMain: pick(row, ["cnae principal"]),
        cnaeDescription: pick(row, ["cnae descricao", "cnae descrição"]),
        cnaeSecondary: pick(row, ["cnae secundario", "cnae secundário"]),
        companySize: pick(row, ["porte"]),
        openedAt: normalizeDate(pick(row, ["abertura"])),
        shareCapital: pick(row, ["capital social"]),
        ddd,
        phone2: cleanPhone(pick(row, ["telefone 2"])),
        mobile,
        whatsappSuggested,
        ownerName,
        role: pick(row, ["cargo"]),
        address: pick(row, ["endereco", "endereço"]),
        importBatch,
        importedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
    })
    .filter((lead) => lead.name || lead.phone || lead.email || lead.cnpj);
}

function getLeadOrigin(lead: Lead) {
  if (lead.leadOrigin === "imported" || lead.source === IMPORT_SOURCE || lead.source?.includes("import")) {
    return "imported";
  }
  return "site";
}

function getOriginLabel(lead: Lead) {
  return getLeadOrigin(lead) === "imported" ? IMPORT_SOURCE_LABEL : SITE_SOURCE_LABEL;
}

function formatLeadDate(lead: Lead) {
  if (lead.date) return lead.date;
  const seconds = lead.createdAt?.seconds;
  if (seconds) return new Date(seconds * 1000).toISOString().slice(0, 10);
  return "-";
}

function statusClass(status?: string) {
  const normalized = String(status || "Novo").toLowerCase();
  if (normalized.includes("fechado") || normalized.includes("ganho")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized.includes("atendimento") || normalized.includes("contato")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized.includes("perdido")) return "bg-red-50 text-red-700 border-red-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function originClass(lead: Lead) {
  return getLeadOrigin(lead) === "imported"
    ? "bg-zinc-950 text-white border-zinc-950"
    : "bg-action/10 text-action border-action/30";
}

function phoneForLink(lead: Lead) {
  const raw = lead.whatsappSuggested || lead.phone || lead.mobile || "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function whatsappHref(lead: Lead) {
  const phone = phoneForLink(lead);
  if (!phone) return "";
  const name = lead.tradeName || lead.companyName || lead.name || "";
  const text = `Olá${name ? `, ${name}` : ""}! Tudo bem? Aqui é da Casaboni. Estou entrando em contato para falar sobre soluções em pisos, telhas e rodapés.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function mailHref(lead: Lead) {
  if (!lead.email) return "";
  const subject = "Contato Casaboni";
  const body = `Olá${lead.ownerName ? `, ${lead.ownerName}` : ""}.\n\nTudo bem? Aqui é da Casaboni. Gostaria de falar sobre soluções em pisos, telhas e rodapés para sua empresa.\n\nFico à disposição.`;
  return `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function mapsHref(lead: Lead) {
  const query = [lead.address, lead.city, lead.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
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
  const [page, setPage] = useState(1);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({
    status: "",
    name: "",
    phone: "",
    email: "",
    city: "",
    uf: "",
    product: "",
    notes: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.city,
        lead.uf,
        lead.product,
        lead.companyName,
        lead.tradeName,
        lead.ownerName,
        lead.cnpj,
        lead.segment,
        lead.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [leads, search]);

  const importedCount = useMemo(() => leads.filter((lead) => getLeadOrigin(lead) === "imported").length, [leads]);
  const siteCount = leads.length - importedCount;
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredLeads]);

  useEffect(() => {
    setPage(1);
  }, [search]);

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

    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(6000));
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
          const docId = lead.cnpj ? `imported_${lead.cnpj}` : undefined;
          const ref = docId ? doc(db, "leads", docId) : doc(collection(db, "leads"));
          batch.set(ref, lead, { merge: true });
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

  const openEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setEditForm({
      status: lead.status || "Novo",
      name: lead.name || "",
      phone: lead.phone || lead.whatsappSuggested || lead.mobile || "",
      email: lead.email || "",
      city: lead.city || "",
      uf: lead.uf || "",
      product: lead.recommendedProduct || lead.product || "",
      notes: lead.notes || lead.filterReason || "",
    });
  };

  const saveLeadEdit = async () => {
    if (!editingLead) return;
    try {
      await updateDoc(doc(db, "leads", editingLead.id), {
        status: editForm.status.trim() || "Novo",
        name: editForm.name.trim(),
        phone: cleanPhone(editForm.phone),
        email: editForm.email.trim(),
        city: editForm.city.trim(),
        uf: editForm.uf.trim().toUpperCase(),
        product: editForm.product.trim(),
        recommendedProduct: editForm.product.trim(),
        notes: editForm.notes.trim(),
      });
      setEditingLead(null);
    } catch (error: any) {
      console.error("edit lead error:", error);
      alert(error?.code === "permission-denied" ? "Sem permissão para editar lead." : "Erro ao editar lead.");
    }
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
    <div className="min-h-screen bg-[#f4f1ec] flex">
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
        <header className="flex flex-col gap-6 mb-8 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-action mb-3">CRM Casaboni</p>
            <h1 className="text-4xl font-bold text-primary uppercase tracking-tighter">Leads</h1>
            <p className="text-sm text-outline mt-2 max-w-2xl">
              Base comercial com origem identificada, score de oportunidade e contatos importados para prospecção.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar empresa, cidade, telefone..."
                className="pl-11 pr-4 py-3 bg-white border border-outline-variant rounded-2xl text-sm focus:outline-none focus:border-action w-full sm:w-96 shadow-sm"
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
              className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" /> Importar base
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-4">
          <div className="bg-primary text-white p-5 rounded-3xl shadow-ambient">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">Total</p>
            <strong className="block text-3xl mt-2">{leads.length}</strong>
          </div>
          <div className="bg-white border border-outline-variant p-5 rounded-3xl shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.25em] text-outline">Do site</p>
            <strong className="block text-3xl text-action mt-2">{siteCount}</strong>
          </div>
          <div className="bg-white border border-outline-variant p-5 rounded-3xl shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.25em] text-outline">Importados</p>
            <strong className="block text-3xl text-primary mt-2">{importedCount}</strong>
          </div>
          <div className="bg-white border border-outline-variant p-5 rounded-3xl shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.25em] text-outline">Exibindo</p>
            <strong className="block text-3xl text-primary mt-2">{paginatedLeads.length}</strong>
          </div>
        </section>

        {dbError && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 text-sm uppercase tracking-wider font-bold rounded-2xl">
            {dbError}
          </div>
        )}

        {previewRows.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 bg-white border border-outline-variant shadow-ambient rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-outline-variant flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Prévia da importação</h2>
                <p className="text-xs text-outline mt-1">{previewRows.length} contatos prontos para importar com badge Importado.</p>
              </div>
              <button
                onClick={importPreview}
                disabled={importing}
                className="flex items-center justify-center gap-2 bg-action text-white px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> {importing ? "Importando..." : "Confirmar importação"}
              </button>
            </div>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left">
                <thead className="bg-surface-low sticky top-0">
                  <tr>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Empresa</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Contato</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Score</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Produto indicado</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-outline">Cidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {previewRows.slice(0, 20).map((lead, index) => (
                    <tr key={`${lead.cnpj || lead.phone}-${index}`}>
                      <td className="p-3 text-sm font-bold text-primary">{lead.tradeName || lead.companyName || lead.name || "-"}</td>
                      <td className="p-3 text-xs text-outline">{lead.phone || lead.email || "-"}</td>
                      <td className="p-3 text-xs text-outline">{lead.classification || "-"} {lead.score ? `• ${lead.score}` : ""}</td>
                      <td className="p-3 text-xs text-outline max-w-md truncate">{lead.recommendedProduct || lead.product || "-"}</td>
                      <td className="p-3 text-xs text-outline">{lead.city || "-"}/{lead.uf || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        <section className="bg-white border border-outline-variant rounded-[2rem] shadow-ambient overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-white">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Base de Leads</h2>
              <p className="text-xs text-outline mt-1">Cards comerciais com origem, score e próximo status.</p>
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-outline">
              {filteredLeads.length} leads • Página {currentPage} de {totalPages}
            </span>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="p-10 text-center text-outline">Carregando...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-10 text-center text-outline">Nenhum lead encontrado.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {paginatedLeads.map((lead) => {
                  const waLink = whatsappHref(lead);
                  const emailLink = mailHref(lead);
                  const mapLink = mapsHref(lead);
                  return (
                  <motion.article
                    key={lead.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative overflow-hidden rounded-3xl border border-outline-variant bg-[#fbfaf7] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-ambient"
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-action via-primary to-zinc-300" />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${originClass(lead)}`}>
                            <BadgeCheck className="h-3 w-3" /> {getOriginLabel(lead)}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${statusClass(lead.status)}`}>
                            {lead.status || "Novo"}
                          </span>
                          {lead.classification && (
                            <span className="rounded-full border border-action/25 bg-action/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-action">
                              {lead.classification}{lead.score ? ` • ${lead.score}` : ""}
                            </span>
                          )}
                        </div>
                        <h3 className="truncate text-lg font-black uppercase tracking-tight text-primary">
                          {lead.tradeName || lead.companyName || lead.name || "Sem nome"}
                        </h3>
                        {(lead.companyName || lead.ownerName) && (
                          <p className="mt-1 text-xs text-outline">
                            {lead.companyName && lead.companyName !== lead.tradeName ? lead.companyName : lead.ownerName}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => openEditLead(lead)} className="rounded-full border border-outline-variant bg-white p-2 transition-colors hover:border-action hover:text-action" title="Editar lead">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => void deleteLead(lead)} className="rounded-full border border-outline-variant bg-white p-2 transition-colors hover:border-red-300 hover:text-red-600" title="Excluir lead">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 text-sm text-primary sm:grid-cols-2">
                      <a
                        href={waLink || undefined}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => !waLink && event.preventDefault()}
                        className={`flex items-center gap-2 rounded-2xl bg-white p-3 transition-colors ${waLink ? "hover:bg-action/10 hover:text-action" : "cursor-not-allowed opacity-70"}`}
                        title={waLink ? "Abrir WhatsApp" : "Telefone indisponível"}
                      >
                        <Phone className="h-4 w-4 text-action" />
                        <span className="truncate font-semibold">{lead.whatsappSuggested || lead.phone || lead.mobile || "Sem telefone"}</span>
                      </a>
                      <a
                        href={mapLink || undefined}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => !mapLink && event.preventDefault()}
                        className={`flex items-center gap-2 rounded-2xl bg-white p-3 transition-colors ${mapLink ? "hover:bg-action/10 hover:text-action" : "cursor-not-allowed opacity-70"}`}
                        title={mapLink ? "Abrir no Google Maps" : "Localização indisponível"}
                      >
                        <MapPin className="h-4 w-4 text-action" />
                        <span className="truncate font-semibold">{lead.city || "Cidade não informada"}{lead.uf ? `/${lead.uf}` : ""}</span>
                      </a>
                      <a
                        href={emailLink || undefined}
                        onClick={(event) => !emailLink && event.preventDefault()}
                        className={`flex items-center gap-2 rounded-2xl bg-white p-3 transition-colors sm:col-span-2 ${emailLink ? "hover:bg-action/10 hover:text-action" : "cursor-not-allowed opacity-70"}`}
                        title={emailLink ? "Enviar e-mail" : "E-mail indisponível"}
                      >
                        <Mail className="h-4 w-4 text-action" />
                        <span className="truncate font-semibold">{lead.email || "E-mail não informado"}</span>
                      </a>
                    </div>

                    <div className="mt-4 space-y-3 rounded-3xl border border-outline-variant bg-white p-4">
                      <div className="flex items-start gap-3">
                        <Target className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Produto indicado</p>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold text-primary">{lead.recommendedProduct || lead.product || "Sem produto informado"}</p>
                        </div>
                      </div>
                      {(lead.segment || lead.environment) && (
                        <div className="flex items-start gap-3">
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Segmento / ambiente</p>
                            <p className="mt-1 line-clamp-2 text-sm text-primary">{lead.segment || lead.environment}</p>
                          </div>
                        </div>
                      )}
                      {(lead.filterReason || lead.notes) && (
                        <div className="flex items-start gap-3">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Inteligência comercial</p>
                            <p className="mt-1 line-clamp-3 text-xs leading-5 text-outline">{lead.filterReason || lead.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-outline">
                      <span>CNPJ: {lead.cnpj || "-"}</span>
                      <span>Entrada: {formatLeadDate(lead)}</span>
                    </div>
                  </motion.article>
                )})}
              </div>
            )}

            {!loading && filteredLeads.length > PAGE_SIZE && (
              <div className="mt-8 flex flex-col gap-4 border-t border-outline-variant pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-outline">
                  Mostrando {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredLeads.length)} de {filteredLeads.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                  <span className="rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Próxima <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {editingLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-6 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-ambient"
            >
              <div className="flex items-start justify-between border-b border-outline-variant p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-action">Editar lead</p>
                  <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-primary">
                    {editingLead.tradeName || editingLead.companyName || editingLead.name || "Lead"}
                  </h3>
                </div>
                <button onClick={() => setEditingLead(null)} className="rounded-full border border-outline-variant p-2 text-primary hover:border-action hover:text-action">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-2">
                {[
                  ["Status", "status"],
                  ["Nome", "name"],
                  ["WhatsApp / telefone", "phone"],
                  ["E-mail", "email"],
                  ["Cidade", "city"],
                  ["UF", "uf"],
                  ["Produto indicado", "product"],
                ].map(([label, key]) => (
                  <label key={key} className={key === "product" ? "md:col-span-2" : ""}>
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-outline">{label}</span>
                    <input
                      value={editForm[key as keyof typeof editForm]}
                      onChange={(event) => setEditForm((form) => ({ ...form, [key]: event.target.value }))}
                      className="w-full rounded-2xl border border-outline-variant bg-surface-low px-4 py-3 text-sm text-primary outline-none transition-colors focus:border-action"
                    />
                  </label>
                ))}
                <label className="md:col-span-2">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-outline">Observações</span>
                  <textarea
                    value={editForm.notes}
                    onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-outline-variant bg-surface-low px-4 py-3 text-sm text-primary outline-none transition-colors focus:border-action"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t border-outline-variant bg-surface-low p-6">
                <button onClick={() => setEditingLead(null)} className="rounded-full border border-outline-variant bg-white px-5 py-3 text-xs font-bold uppercase tracking-widest text-primary">
                  Cancelar
                </button>
                <button onClick={() => void saveLeadEdit()} className="rounded-full bg-action px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#c96a2b]">
                  Salvar alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
