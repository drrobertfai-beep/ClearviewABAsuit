// ClearView ABA Suite — Auth DB helpers (server-only)
// Session and user queries for authentication.

import { sql } from "./sql";
import type { User } from "./types";

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface SessionWithUser {
  session: Session;
  user: User;
}

// ============================================================================
// User helpers
// ============================================================================

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: r.role as User["role"],
    password_hash: String(r.password_hash),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: r.role as User["role"],
    password_hash: String(r.password_hash),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function createUser(
  name: string,
  email: string,
  passwordHash: string,
  role: string,
): Promise<User> {
  const rows = await sql()`
    INSERT INTO users (name, email, role, password_hash)
    VALUES (${name}, ${email.toLowerCase().trim()}, ${role}, ${passwordHash})
    RETURNING *
  `;
  const r = rows[0];
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: r.role as User["role"],
    password_hash: String(r.password_hash),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

// ============================================================================
// Session helpers
// ============================================================================

export async function createSession(
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<Session> {
  const rows = await sql()`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  const r = rows[0];
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    token: String(r.token),
    expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function getSessionByToken(token: string): Promise<SessionWithUser | null> {
  const rows = await sql()`
    SELECT s.id as s_id, s.user_id as s_user_id, s.token as s_token,
           s.expires_at as s_expires_at, s.created_at as s_created_at,
           u.id as u_id, u.email as u_email, u.name as u_name,
           u.role as u_role, u.password_hash as u_password_hash,
           u.created_at as u_created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    session: {
      id: String(r.s_id),
      user_id: String(r.s_user_id),
      token: String(r.s_token),
      expires_at: r.s_expires_at instanceof Date ? r.s_expires_at.toISOString() : String(r.s_expires_at),
      created_at: r.s_created_at instanceof Date ? r.s_created_at.toISOString() : String(r.s_created_at),
    },
    user: {
      id: String(r.u_id),
      email: String(r.u_email),
      name: String(r.u_name),
      role: r.u_role as User["role"],
      password_hash: String(r.u_password_hash),
      created_at: r.u_created_at instanceof Date ? r.u_created_at.toISOString() : String(r.u_created_at),
    },
  };
}

export async function deleteSession(token: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE token = ${token}`;
}

export async function deleteExpiredSessions(): Promise<void> {
  await sql()`DELETE FROM sessions WHERE expires_at <= now()`;
}
