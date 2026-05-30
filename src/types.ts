export interface Lead {
  id: string;
  name: string;
  phone: string;
  city: string;
  product: string;
  environment: string;
  area: string;
  date: string;
  status: string;
}

export interface Product {
  id: string;
  name: string;
  collection: string;
  price: string;
  status: string;
  image: string;
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
