export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | null;

export type SessionUser = {
  user_id: number;
  email: string;
  full_name: string | null;
  token_id: number;
};

export type SessionIssued = {
  token: string;
  maxAge: number;
};

export type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  is_system: number;
  version: number;
};