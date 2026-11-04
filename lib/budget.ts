/**
 * Orçamento de tempo de uma requisição da Suri. Toda chamada externa usa
 * `timeoutFor()` para nunca ultrapassar o prazo total (somando retries).
 */
export class BudgetExceededError extends Error {
  constructor() {
    super("Orçamento de tempo da requisição esgotado");
    this.name = "BudgetExceededError";
  }
}

export class Budget {
  readonly startedAt: number;
  readonly deadline: number;

  constructor(totalMs: number, now: number = Date.now()) {
    this.startedAt = now;
    this.deadline = now + totalMs;
  }

  remaining(): number {
    return this.deadline - Date.now();
  }

  elapsed(): number {
    return Date.now() - this.startedAt;
  }

  /** Timeout para a próxima chamada: o menor entre `maxMs` e o que resta. */
  timeoutFor(maxMs: number): number {
    return Math.max(0, Math.min(maxMs, this.remaining()));
  }

  /** Lança se não houver ao menos `minMs` disponíveis. */
  ensure(minMs = 300): void {
    if (this.remaining() < minMs) throw new BudgetExceededError();
  }
}

/** Margem reservada para processar/serializar a resposta depois das chamadas. */
export const RESPONSE_MARGIN_MS = 500;
