const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const filePath = process.argv.find((arg) => arg.endsWith('.csv')) || 'C:/Users/Patrick Barden/Downloads/Leads_A+++_Pisos_Telhas_Rodapes_RS_CSV(1)/Leads_A+++_Pisos_Telhas_Rodapes_RS.csv';
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

const firebase = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || config.apiKey,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || config.projectId,
  databaseId: process.env.VITE_FIREBASE_DATABASE_ID || config.firestoreDatabaseId,
};

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
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
    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((row) =>
    headers.reduce((acc, header, index) => {
      acc[String(header || `coluna_${index + 1}`).replace(/^\uFEFF/, '')] = row[index] || '';
      return acc;
    }, {})
  );
}

function pick(row, aliases) {
  const normalized = Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});
  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return value;
}

function mapLead(row) {
  const cnpj = cleanPhone(pick(row, ['cnpj']));
  const companyName = pick(row, ['empresa', 'razao social', 'razão social']);
  const tradeName = pick(row, ['nome fantasia', 'fantasia']);
  const ownerName = pick(row, ['proprietario/socio', 'proprietário/sócio', 'socio', 'sócio', 'contato']);
  const whatsappSuggested = cleanPhone(pick(row, ['whatsapp sugerido', 'whatsapp']));
  const mobile = cleanPhone(pick(row, ['celular']));
  const ddd = cleanPhone(pick(row, ['ddd']));
  const phone = whatsappSuggested || mobile || `${ddd}${cleanPhone(pick(row, ['telefone', 'phone']))}`;
  const recommendedProduct = pick(row, ['produto/abordagem indicada', 'produto', 'interesse']);
  const segment = pick(row, ['segmento estrategico', 'segmento estratégico']);
  const filterReason = pick(row, ['motivo do filtro a+++', 'motivo', 'observacoes', 'observações']);

  return {
    name: tradeName || companyName || ownerName,
    phone,
    email: pick(row, ['email', 'e-mail']),
    city: pick(row, ['cidade', 'city']),
    uf: pick(row, ['uf', 'estado']),
    product: recommendedProduct,
    recommendedProduct,
    environment: segment,
    area: '',
    date: new Date().toISOString().slice(0, 10),
    status: 'Novo',
    source: 'imported-list',
    sourceLabel: 'Importado',
    leadOrigin: 'imported',
    notes: filterReason,
    rank: pick(row, ['rank']),
    classification: pick(row, ['classificacao', 'classificação']),
    score: pick(row, ['score a+++', 'score']),
    segment,
    filterReason,
    cnpj,
    companyName,
    tradeName,
    cnaeMain: pick(row, ['cnae principal']),
    cnaeDescription: pick(row, ['cnae descricao', 'cnae descrição']),
    cnaeSecondary: pick(row, ['cnae secundario', 'cnae secundário']),
    companySize: pick(row, ['porte']),
    openedAt: normalizeDate(pick(row, ['abertura'])),
    shareCapital: pick(row, ['capital social']),
    ddd,
    phone2: cleanPhone(pick(row, ['telefone 2'])),
    mobile,
    whatsappSuggested,
    ownerName,
    role: pick(row, ['cargo']),
    address: pick(row, ['endereco', 'endereço']),
    importBatch: 'import-2026-05-31-rs-a-plus',
    importedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function toFirestoreValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .map(([key, item]) => [key, toFirestoreValue(item)])
            .filter(([, item]) => item)
        ),
      },
    };
  }
  if ((String(value).includes('T') && !Number.isNaN(Date.parse(String(value)))) && /At$|^createdAt$|^importedAt$/.test(arguments[1] || '')) {
    return { timestampValue: String(value) };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'createdAt' || key === 'importedAt') {
      fields[key] = { timestampValue: String(value) };
      continue;
    }
    const converted = toFirestoreValue(value);
    if (converted) fields[key] = converted;
  }
  return fields;
}

function docIdFor(lead, index) {
  const base = lead.cnpj || lead.whatsappSuggested || lead.phone || `${lead.name}-${index}`;
  return 'imported_' + String(base).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

async function upsertLead(lead, index) {
  const docId = docIdFor(lead, index);
  const url = `https://firestore.googleapis.com/v1/projects/${firebase.projectId}/databases/${firebase.databaseId}/documents/leads?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(firebase.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(lead) }),
  });
  if (response.status === 409) return docId;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore ${response.status}: ${text.slice(0, 300)}`);
  }
  return docId;
}

async function runPool(items, worker, concurrency = 20) {
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const current = cursor++;
      await worker(items[current], current);
      done += 1;
      if (done % 250 === 0 || done === items.length) console.log(`Imported ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  let leads = rowsToObjects(parseCsv(text)).map(mapLead).filter((lead) => lead.name || lead.phone || lead.email || lead.cnpj);
  if (limit > 0) leads = leads.slice(0, limit);
  console.log(`Target: ${firebase.projectId}/${firebase.databaseId}`);
  console.log(`CSV: ${filePath}`);
  console.log(`Leads to import: ${leads.length}`);
  await runPool(leads, upsertLead, 8);
  console.log('Import complete.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
