/**
 * Regras puras de controle de acesso ao painel (testáveis sem o Auth.js).
 */
import { allowedEmail } from "./env";

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** E-mail exatamente igual a ALLOWED_EMAIL (case-insensitive). */
export function isAllowedEmail(email: unknown, allowed: string = allowedEmail()): boolean {
  const e = normalizeEmail(email);
  const a = normalizeEmail(allowed);
  return e.length > 0 && a.length > 0 && e === a;
}

/**
 * Regra do callback signIn: perfil Google com e-mail verificado
 * (`email_verified === true`, booleano) e igual ao permitido.
 */
export function isAllowedGoogleProfile(
  profile: { email?: unknown; email_verified?: unknown } | null | undefined,
  allowed: string = allowedEmail(),
): boolean {
  if (!profile) return false;
  return profile.email_verified === true && isAllowedEmail(profile.email, allowed);
}
