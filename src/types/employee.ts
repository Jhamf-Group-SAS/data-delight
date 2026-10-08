export interface Employee {
  id: string;
  proyecto: string;
  centroOperacion: string;
  cargo: string;
  cedula: string;
  nombre: string;
  numero: string;
  status: string;
  // Campos adicionales cuando viene de BD
  createdAt?: string;
  usuarioNombre?: string; // solo visible para admin
}

export type EmployeeFormData = Omit<Employee, 'id' | 'createdAt' | 'usuarioNombre'>;

export interface User {
  id: number;
  username: string;
  nombre: string;
  rol: 'admin' | 'operador';
}

export interface AdminUser {
  id: number;
  username: string;
  nombre: string;
  rol: 'admin' | 'operador';
  activo: number;
  created_at: string;
  /** True for configured protected accounts (only they can modify themselves). */
  protegido?: boolean;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Proyecto {
  id: number;
  nombre: string;
  created_at: string;
  /** The sibling automation service's Chatwoot routing key -- `null` when this proyecto has no mapping row yet. */
  teamSlug: string | null;
  teamActive: boolean;
}
