"use client";

import { useCallback, useEffect, useState } from "react";

interface ErrorItem {
  id: string;
  created_at: string;
  correlation_id: string;
  route: string;
  step: string | null;
  gfsis_endpoint: string | null;
  http_status: number | null;
  error_code: string | null;
  message: string | null;
  request_payload?: unknown;
  response_snippet?: string | null;
  resolved: boolean;
  resolved_at: string | null;
}

interface ListResponse {
  ok: boolean;
  items: ErrorItem[];
  total: number;
  page: number;
  pageSize: number;
  counters: { last24h: number; last7d: number; unresolved: number };
  routes: string[];
  message?: string;
}

type Periodo = "24h" | "7d" | "30d" | "90d" | "all";
type Resolvido = "all" | "false" | "true";

const PERIODOS: Array<[Periodo, string]> = [
  ["24h", "Últimas 24h"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
  ["90d", "Últimos 90 dias"],
  ["all", "Tudo"],
];

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Fortaleza" });

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-900";
const btnCls =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";
const btnPrimary =
  "rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50";

export function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [route, setRoute] = useState("");
  const [resolved, setResolved] = useState<Resolvido>("false");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ErrorItem | null>(null);
  const [teste, setTeste] = useState<{ ok: boolean; message: string } | null>(null);
  const [testando, setTestando] = useState(false);

  const pageSize = 20;

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({ periodo, resolved, page: String(page), pageSize: String(pageSize) });
      if (route) qs.set("route", route);
      const res = await fetch(`/api/admin/errors?${qs}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!json.ok) throw new Error(json.message ?? "Falha ao carregar");
      setData(json);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [periodo, route, resolved, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirDetalhe = async (id: string) => {
    const res = await fetch(`/api/admin/errors/${id}`, { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; item?: ErrorItem };
    if (json.ok && json.item) setDetalhe(json.item);
  };

  const marcarResolvido = async (id: string, valor: boolean) => {
    const res = await fetch(`/api/admin/errors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: valor }),
    });
    if (res.ok) {
      setDetalhe((d) => (d && d.id === id ? { ...d, resolved: valor } : d));
      void carregar();
    }
  };

  const testarGfsis = async () => {
    setTestando(true);
    setTeste(null);
    try {
      const res = await fetch("/api/admin/gfsis-test", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; message: string; authMs?: number; consultaMs?: number | null };
      const tempos = json.consultaMs == null ? `auth ${json.authMs}ms` : `auth ${json.authMs}ms, agenda ${json.consultaMs}ms`;
      setTeste({
        ok: json.ok,
        message: json.ok ? `${json.message} (${tempos})` : json.message,
      });
    } catch {
      setTeste({ ok: false, message: "Não foi possível executar o teste." });
    } finally {
      setTestando(false);
    }
  };

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Erros da integração</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Apenas falhas técnicas e validações do GFSIS são registradas (retenção de 90 dias).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button className={btnPrimary} onClick={testarGfsis} disabled={testando}>
            {testando ? "Testando…" : "Testar conexão com o GFSIS"}
          </button>
          {teste && (
            <span
              className={`max-w-md text-right text-sm ${teste.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {teste.ok ? "✔ " : "✖ "}
              {teste.message}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Contador titulo="Últimas 24h" valor={data?.counters.last24h} />
        <Contador titulo="Últimos 7 dias" valor={data?.counters.last7d} />
        <Contador titulo="Não resolvidos" valor={data?.counters.unresolved} destaque />
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Período
          <select className={inputCls} value={periodo} onChange={(e) => { setPeriodo(e.target.value as Periodo); setPage(1); }}>
            {PERIODOS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Rota
          <select className={inputCls} value={route} onChange={(e) => { setRoute(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {data?.routes.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Situação
          <select className={inputCls} value={resolved} onChange={(e) => { setResolved(e.target.value as Resolvido); setPage(1); }}>
            <option value="false">Não resolvidos</option>
            <option value="true">Resolvidos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <div className="ml-auto self-end">
          <button className={btnCls} onClick={() => void carregar()} disabled={loading}>
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Rota</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Mensagem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Nenhum erro encontrado com esses filtros. 🎉
                  </td>
                </tr>
              )}
              {data?.items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  onClick={() => void abrirDetalhe(item.id)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtData(item.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{item.route.replace("/api/suri", "")}</td>
                  <td className="whitespace-nowrap px-4 py-3">{item.step ?? "—"}</td>
                  <td className="px-4 py-3">{item.http_status ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded bg-brand-50 px-2 py-0.5 font-mono text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                      {item.error_code ?? "—"}
                    </span>
                  </td>
                  <td className="max-w-md truncate px-4 py-3" title={item.message ?? ""}>{item.message ?? "—"}</td>
                  <td className="px-4 py-3">
                    {item.resolved ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">✔ resolvido</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">{data ? `${data.total} registro(s)` : "—"}</span>
          <div className="flex items-center gap-2">
            <button className={btnCls} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span className="text-slate-500">
              {page} / {totalPaginas}
            </span>
            <button className={btnCls} disabled={page >= totalPaginas || loading} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </button>
          </div>
        </div>
      </div>

      {detalhe && <Detalhe item={detalhe} onClose={() => setDetalhe(null)} onResolver={marcarResolvido} />}
    </div>
  );
}

function Contador({ titulo, valor, destaque = false }: { titulo: string; valor?: number; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{titulo}</div>
      <div className={`mt-1 text-3xl font-semibold ${destaque && valor ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {valor ?? "—"}
      </div>
    </div>
  );
}

function Detalhe({
  item,
  onClose,
  onResolver,
}: {
  item: ErrorItem;
  onClose: () => void;
  onResolver: (id: string, v: boolean) => Promise<void>;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copiar = async () => {
    await navigator.clipboard.writeText(item.correlation_id);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  const campos: Array<[string, React.ReactNode]> = [
    ["Data", fmtData(item.created_at)],
    ["Rota", <code key="r">{item.route}</code>],
    ["Etapa", item.step ?? "—"],
    ["Endpoint GFSIS", item.gfsis_endpoint ?? "—"],
    ["Status HTTP", item.http_status ?? "—"],
    ["Código", item.error_code ?? "—"],
    ["Correlation ID", <code key="c" className="break-all">{item.correlation_id}</code>],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Detalhes do erro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">✕</button>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {campos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Bloco titulo="Mensagem">{item.message ?? "—"}</Bloco>
        <Bloco titulo="Payload recebido (mascarado)">{JSON.stringify(item.request_payload ?? null, null, 2)}</Bloco>
        <Bloco titulo="Resposta do GFSIS (trecho)">{item.response_snippet || "—"}</Bloco>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className={btnCls} onClick={() => void copiar()}>
            {copiado ? "Copiado!" : "Copiar correlation_id"}
          </button>
          {item.resolved ? (
            <button className={btnCls} onClick={() => void onResolver(item.id, false)}>Reabrir</button>
          ) : (
            <button className={btnPrimary} onClick={() => void onResolver(item.id, true)}>Marcar como resolvido</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-950">
        {children}
      </pre>
    </div>
  );
}
