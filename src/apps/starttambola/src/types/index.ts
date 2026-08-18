// ─── Shared TypeScript types matching the Tambola SaaS DB schema ─────────────
// These will be expanded as the schema is defined and endpoints are implemented.
// Each section corresponds to a Supabase table or domain concept.

// ─── Common ──────────────────────────────────────────────────────────────────
export type UUID = string;
export type ISOTimestamp = string;

export type PaginationParams = {
  page?: number;
  limit?: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

// ─── API Response shapes ──────────────────────────────────────────────────────
export type ApiSuccessResponse<T = unknown> = {
  data: T;
  message?: string;
};

export type ApiErrorResponse = {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
};

// ─── Tenant ──────────────────────────────────────────────────────────────────
// Placeholder — will be expanded with full schema types in subsequent prompts
export type Tenant = {
  id: UUID;
  name: string;
  slug: string;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
};

// ─── Game ─────────────────────────────────────────────────────────────────────
export type GameStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';

export type Game = {
  id: UUID;
  tenant_id: UUID;
  name: string;
  status: GameStatus;
  max_tickets: number;
  ticket_price: number;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
};

// ─── Ticket ───────────────────────────────────────────────────────────────────
export type Ticket = {
  id: UUID;
  game_id: UUID;
  tenant_id: UUID;
  player_name: string;
  player_phone?: string;
  numbers: number[][]; // 3x9 Tambola grid
  created_at: ISOTimestamp;
};

// ─── User / Auth ──────────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'tenant_admin' | 'host' | 'player';

export type AuthUser = {
  id: UUID;
  email: string;
  role: UserRole;
  tenant_id?: UUID;
};
