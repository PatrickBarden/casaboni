export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city: string;
  uf?: string;
  product: string;
  environment: string;
  area: string;
  date: string;
  status: string;
  source?: string;
  sourceLabel?: string;
  leadOrigin?: "site" | "imported";
  notes?: string;
  rank?: string | number;
  classification?: string;
  score?: string | number;
  segment?: string;
  recommendedProduct?: string;
  filterReason?: string;
  cnpj?: string;
  companyName?: string;
  tradeName?: string;
  cnaeMain?: string;
  cnaeDescription?: string;
  cnaeSecondary?: string;
  companySize?: string;
  openedAt?: string;
  shareCapital?: string | number;
  ddd?: string;
  phone2?: string;
  mobile?: string;
  whatsappSuggested?: string;
  ownerName?: string;
  role?: string;
  address?: string;
  importBatch?: string;
  createdAt?: any;
  importedAt?: any;
}

export interface Product {
  id: string;
  name: string;
  collection: string;
  price: string;
  status: string;
  image: string;
  desc?: string;
  tags?: string[];
}

export interface Meeting {
  id: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  date: string;
  time: string;
  topic: string;
  status: "Agendada" | "Concluída" | "Cancelada";
}

export interface AdminUser {
  id: string;
  email?: string;
  name?: string;
  role: "admin" | "sales" | "viewer";
  createdAt?: any;
}
