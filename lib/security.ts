import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparação em tempo constante. Os valores passam por SHA-256 antes,
 * para que comprimentos diferentes não vazem pelo tempo de resposta.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Extrai o valor de "Authorization: Bearer xxx". */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
