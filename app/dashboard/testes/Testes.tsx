"use client";

import { useState } from "react";
import { Badge, btnPrimary, btnSecondary, card, CodeBlock, inputCls } from "../ui";

type Rota = "health" | "cliente/consultar" | "cliente/salvar" | "horarios" | "agendar";

interface Resultado {
  ok: boolean;
  message?: string;
  rota?: string;
  method?: string;
  httpStatus?: number;
  durationMs?: number;
  resposta?: unknown;
}

interface Opcao {
  numero: number;
  data: string;
  horario: string;
  label: string;
}

interface Teste {
  rota: Rota;
  titulo: string;
  etapa: string;
  descricao: string;
  grava?: string;
  exemplo: (cpf: string) => unknown;
}

const TESTES: Teste[] = [
  {
    rota: "health",
    titulo: "Health check",
    etapa: "Monitoramento",
    descricao: "Confirma que a API está no ar. Não chama o GFSIS e não exige API key.",
    exemplo: () => null,
  },
  {
    rota: "cliente/consultar",
    titulo: "Consultar cliente",
    etapa: "Etapa 3",
    descricao: "Busca o cliente no GFSIS pelo CPF e informa quais dados faltam no cadastro. Somente leitura.",
    exemplo: (cpf) => ({ cpf }),
  },
  {
    rota: "cliente/salvar",
    titulo: "Cadastrar / atualizar cliente",
    etapa: "Etapa 4",
    descricao:
      "Cria o cliente no GFSIS ou completa o cadastro existente. Campos vazios são ignorados e não apagam dados. O endereço é completado pelo CEP (ViaCEP).",
    grava: "Grava o cadastro do cliente no GFSIS de verdade.",
    exemplo: (cpf) => ({
      cpf,
      nome: "Cliente Teste",
      email: "cliente.teste@exemplo.com",
      telefone: "(85) 99999-8888",
      dataNascimento: "01/01/1990",
      cep: "60165-121",
      numero: "100",
      complemento: "",
    }),
  },
  {
    rota: "horarios",
    titulo: "Consultar horários",
    etapa: "Etapas 5–6",
    descricao:
      "Consulta a agenda do GFSIS nos próximos dias de atendimento e devolve as opções numeradas. Somente leitura. Inclua identificadorPontoAtendimento no corpo para testar outro ponto.",
    exemplo: () => ({ periodo: "manha", dias: 5, maxOpcoes: 6 }),
  },
  {
    rota: "agendar",
    titulo: "Criar agendamento",
    etapa: "Etapas 7–8",
    descricao:
      "Cria o agendamento no GFSIS. Se o cliente já tem o mesmo agendamento, devolve JA_AGENDADO sem duplicar. Dica: rode “Consultar horários” e clique em “Usar no agendamento” para preencher data e horário.",
    grava: "Cria um agendamento REAL na agenda do GFSIS. Cancele depois pelo próprio GFSIS.",
    exemplo: (cpf) => ({
      data: "dd/mm/aaaa",
      horario: "09:00",
      cliente: { cpf },
      videoconferencia: true,
      observacao: "Teste pelo painel (pode cancelar)",
    }),
  },
];

const fmt = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v, null, 2));
const anchorId = (rota: Rota) => `teste-${rota.replace("/", "-")}`;

function codeTone(code: unknown, ok: unknown): "green" | "red" | "amber" {
  if (ok === true) return "green";
  if (code === "GFSIS_INDISPONIVEL" || code === "CONFIGURACAO_INVALIDA" || code === "ERRO_INTERNO") return "red";
  return "amber";
}

export function Testes({
  pontoPadrao,
  pontoErro,
  chaveConfigurada,
}: {
  pontoPadrao: number | null;
  pontoErro: string | null;
  chaveConfigurada: boolean;
}) {
  const [cpf, setCpf] = useState("");
  const [corpos, setCorpos] = useState<Record<Rota, string>>(
    () => Object.fromEntries(TESTES.map((t) => [t.rota, fmt(t.exemplo(""))])) as Record<Rota, string>,
  );
  const [resultados, setResultados] = useState<Partial<Record<Rota, Resultado>>>({});
  const [rodando, setRodando] = useState<Rota | null>(null);
  const [confirmados, setConfirmados] = useState<Partial<Record<Rota, boolean>>>({});

  const aplicarCpf = () => {
    setCorpos((atual) => {
      const novo = { ...atual };
      for (const t of TESTES) {
        try {
          const obj = JSON.parse(atual[t.rota] || "null") as Record<string, unknown> | null;
          if (!obj || typeof obj !== "object") continue;
          if ("cpf" in obj) obj.cpf = cpf;
          if (obj.cliente && typeof obj.cliente === "object") (obj.cliente as Record<string, unknown>).cpf = cpf;
          novo[t.rota] = fmt(obj);
        } catch {
          // JSON editado e inválido: deixa como está
        }
      }
      return novo;
    });
  };

  const usarOpcao = (o: Opcao) => {
    setCorpos((atual) => {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(atual.agendar) as Record<string, unknown>;
      } catch {
        obj = TESTES.find((t) => t.rota === "agendar")!.exemplo(cpf) as Record<string, unknown>;
      }
      return { ...atual, agendar: fmt({ ...obj, data: o.data, horario: o.horario }) };
    });
    document.getElementById(anchorId("agendar"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const executar = async (t: Teste) => {
    let body: unknown;
    if (t.rota !== "health") {
      try {
        body = JSON.parse(corpos[t.rota] || "{}");
      } catch {
        setResultados((r) => ({ ...r, [t.rota]: { ok: false, message: "O corpo não é um JSON válido." } }));
        return;
      }
    }
    setRodando(t.rota);
    setResultados((r) => ({ ...r, [t.rota]: undefined }));
    try {
      const res = await fetch("/api/admin/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rota: t.rota, body }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = (await res.json()) as Resultado;
      setResultados((r) => ({ ...r, [t.rota]: json }));
    } catch {
      setResultados((r) => ({ ...r, [t.rota]: { ok: false, message: "Não foi possível executar o teste." } }));
    } finally {
      setRodando(null);
      // Exige nova confirmação a cada execução que grava no GFSIS.
      setConfirmados((c) => ({ ...c, [t.rota]: false }));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Testes das funções</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cada teste chama a mesma rota que a Suri usa, com as mesmas validações e chamadas ao GFSIS. A API key é aplicada
          no servidor. Erros gerados aqui aparecem na aba Erros com correlation_id começando por{" "}
          <code className="font-mono">painel-teste-</code>.
        </p>
      </div>

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>API key da Suri:</span>
          {chaveConfigurada ? <Badge tone="green">configurada</Badge> : <Badge tone="red">SURI_API_KEY ausente</Badge>}
          <span className="ml-4">Ponto de atendimento padrão:</span>
          {pontoErro ? (
            <Badge tone="red">inválido</Badge>
          ) : pontoPadrao === null ? (
            <Badge tone="amber">não configurado</Badge>
          ) : (
            <Badge tone="green">{pontoPadrao}</Badge>
          )}
        </div>
        {pontoErro && <p className="text-xs text-red-600 dark:text-red-400">{pontoErro}</p>}
        {pontoPadrao === null && !pontoErro && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Sem ponto padrão, horários e agendamento só funcionam se você enviar{" "}
            <code className="font-mono">identificadorPontoAtendimento</code> no corpo. Use o teste de horários para descobrir
            o número certo: um ponto inexistente responde <code className="font-mono">PONTO_NAO_ENCONTRADO</code>.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex-1">
            <label htmlFor="cpf" className="mb-1 block text-sm font-medium">CPF de teste</label>
            <input
              id="cpf"
              className={inputCls}
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>
          <button type="button" className={btnSecondary} onClick={aplicarCpf} disabled={!cpf.trim()}>
            Aplicar CPF em todos os testes
          </button>
        </div>
      </section>

      {TESTES.map((t) => {
        const r = resultados[t.rota];
        const resp = (r?.resposta && typeof r.resposta === "object" ? r.resposta : null) as Record<string, unknown> | null;
        const data = (resp?.data && typeof resp.data === "object" ? resp.data : null) as Record<string, unknown> | null;
        const opcoes = t.rota === "horarios" && Array.isArray(data?.opcoes) ? (data.opcoes as Opcao[]) : [];
        const bloqueado = !!t.grava && !confirmados[t.rota];
        return (
          <section key={t.rota} id={anchorId(t.rota)} className={`${card} scroll-mt-24 space-y-3`}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{t.titulo}</h2>
                <Badge tone="brand">{t.etapa}</Badge>
                {t.grava ? <Badge tone="amber">grava no GFSIS</Badge> : <Badge>somente leitura</Badge>}
              </div>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {t.rota === "health" ? "GET" : "POST"} /api/suri/{t.rota}
              </p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t.descricao}</p>

            {t.rota !== "health" && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor={`body-${t.rota}`} className="text-sm font-medium">Corpo (JSON)</label>
                  <button
                    type="button"
                    className="text-xs text-brand-700 hover:underline dark:text-brand-300"
                    onClick={() => setCorpos((c) => ({ ...c, [t.rota]: fmt(t.exemplo(cpf)) }))}
                  >
                    Restaurar exemplo
                  </button>
                </div>
                <textarea
                  id={`body-${t.rota}`}
                  spellCheck={false}
                  rows={Math.min(14, Math.max(3, corpos[t.rota].split("\n").length))}
                  className={`${inputCls} font-mono text-xs`}
                  value={corpos[t.rota]}
                  onChange={(e) => setCorpos((c) => ({ ...c, [t.rota]: e.target.value }))}
                />
              </div>
            )}

            {t.grava && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!confirmados[t.rota]}
                  onChange={(e) => setConfirmados((c) => ({ ...c, [t.rota]: e.target.checked }))}
                />
                <span>{t.grava} Marque para confirmar.</span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => void executar(t)}
                disabled={rodando !== null || bloqueado}
              >
                {rodando === t.rota ? "Executando…" : "Executar teste"}
              </button>
              {r?.httpStatus !== undefined && (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>HTTP {r.httpStatus}</Badge>
                  {resp && "code" in resp && <Badge tone={codeTone(resp.code, resp.ok)}>{String(resp.code)}</Badge>}
                  <span className="text-xs text-slate-500">{r.durationMs} ms</span>
                </span>
              )}
            </div>

            {r && r.httpStatus === undefined && <p className="text-sm text-red-600 dark:text-red-400">{r.message}</p>}

            {resp && typeof resp.message === "string" && (
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <span className="text-xs text-slate-500">Mensagem: </span>
                {resp.message}
              </p>
            )}

            {opcoes.length > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">Opções retornadas</div>
                {opcoes.map((o) => (
                  <div
                    key={o.numero}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800"
                  >
                    <span>
                      {o.numero}) {o.label}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-brand-700 hover:underline dark:text-brand-300"
                      onClick={() => usarOpcao(o)}
                    >
                      Usar no agendamento
                    </button>
                  </div>
                ))}
              </div>
            )}

            {r?.resposta !== undefined && <CodeBlock title="Resposta completa" code={fmt(r.resposta)} />}
          </section>
        );
      })}
    </div>
  );
}
