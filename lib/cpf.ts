/** Mantém apenas dígitos. */
export function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D+/g, "");
}

export function normalizeCpf(value: unknown): string {
  return onlyDigits(value);
}

/** Valida CPF pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 000.000.000-00, 111..., etc.

  const digits = cpf.split("").map(Number);
  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i]! * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === digits[9] && calc(10) === digits[10];
}

export function formatCpf(value: unknown): string {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
