"use client";

import { useMemo, useState } from "react";
import type { MensagensResolvidas } from "@/lib/mensagens";
import {
  MENSAGENS,
  TAMANHO_MAXIMO_MENSAGEM,
  validarTexto,
  variaveisPermitidas,
  type MensagemChave,
  type MensagensPersonalizadas,
} from "@/lib/mensagens-catalogo";

const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-900";

const CHAVES = Object.keys(MENSAGENS) as MensagemChave[];

/** Texto em edição de todas as mensagens (personalizado ou padrão). */
function textosIniciais(p: MensagensPersonalizadas): Record<MensagemChave, string> {
  return Object.fromEntries(CHAVES.map((c) => [c, p[c] ?? MENSAGENS[c].padrao])) as Record<MensagemChave, string>;
}

export function MensagensForm({ inicial, bancoConfigurado }: { inicial: MensagensResolvidas; bancoConfigurado: boolean }) {
  const [salvo, setSalvo] = useState<MensagensResolvidas>(inicial);
  const [textos, setTextos] = useState(() => textosIniciais(inicial.personalizadas));
  const [busca, setBusca] = useState("");
  const [soPersonalizadas, setSoPersonalizadas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const salvoTextos = useMemo(() => textosIniciais(salvo.personalizadas), [salvo]);
  const alteradas = CHAVES.filter((c) => textos[c] !== salvoTextos[c]);
  const erros = Object.fromEntries(
    CHAVES.map((c) => [c, validarTexto(c, textos[c])] as const).filter(([, e]) => e !== null),
  ) as Partial<Record<MensagemChave, string>>;
  const totalPersonalizadas = CHAVES.filter((c) => textos[c] !== MENSAGENS[c].padrao).length;

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const mapa = new Map<string, MensagemChave[]>();
    for (const c of CHAVES) {
      const def = MENSAGENS[c];
      if (soPersonalizadas && textos[c] === def.padrao) continue;
      if (termo && ![c, def.descricao, def.padrao, textos[c], def.grupo].some((t) => t.toLowerCase().includes(termo))) continue;
      mapa.set(def.grupo, [...(mapa.get(def.grupo) ?? []), c]);
    }
    return [...mapa.entries()];
  }, [busca, soPersonalizadas, textos]);

  const alterar = (c: MensagemChave, texto: string) => {
    setTextos((t) => ({ ...t, [c]: texto }));
    setAviso(null);
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    const mensagens = Object.fromEntries(CHAVES.filter((c) => textos[c] !== MENSAGENS[c].padrao).map((c) => [c, textos[c]]));
    try {
      const res = await fetch("/api/admin/mensagens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = (await res.json()) as { ok: boolean; message?: string; mensagens?: MensagensResolvidas };
      if (!json.ok || !json.mensagens) throw new Error(json.message ?? "Falha ao salvar");
      setSalvo(json.mensagens);
      setTextos(textosIniciais(json.mensagens.personalizadas));
      setAviso({ ok: true, texto: "Mensagens salvas. Elas passam a valer em até 30 segundos." });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensagens da Suri</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Textos devolvidos no campo <code>message</code> das rotas /api/suri/*. Os códigos (<code>code</code>) e os dados
          não mudam. Termos entre chaves, como <code>{"{nome}"}</code>, são trocados pelo valor na hora.{" "}
          {salvo.origem === "banco" && salvo.atualizadoEm ? (
            <>
              Última alteração em{" "}
              {new Date(salvo.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {salvo.atualizadoPor ? ` por ${salvo.atualizadoPor}` : ""}.
            </>
          ) : (
            <>Todas com o texto padrão (nada salvo ainda).</>
          )}
        </p>
      </div>

      {!bancoConfigurado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Banco de dados não configurado (DATABASE_URL). Dá para ver as mensagens, mas não salvar.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Buscar por texto, rota ou chave…"
          className={`${inputCls} max-w-sm flex-1`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={soPersonalizadas} onChange={(e) => setSoPersonalizadas(e.target.checked)} />
          Só personalizadas ({totalPersonalizadas})
        </label>
      </div>

      {grupos.length === 0 && <p className="text-sm text-slate-500">Nenhuma mensagem encontrada.</p>}

      {grupos.map(([grupo, chaves]) => (
        <section key={grupo} className={card}>
          <h2 className="mb-4 font-semibold">{grupo}</h2>
          <div className="space-y-5">
            {chaves.map((c) => {
              const def = MENSAGENS[c];
              const vars = variaveisPermitidas(c);
              const personalizada = textos[c] !== def.padrao;
              const erro = erros[c];
              return (
                <div key={c}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <label htmlFor={c} className="text-sm font-medium">
                      {def.descricao}
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      {textos[c] !== salvoTextos[c] && <span className="text-amber-600 dark:text-amber-400">não salva</span>}
                      {personalizada && (
                        <>
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                            Personalizada
                          </span>
                          <button
                            type="button"
                            onClick={() => alterar(c, def.padrao)}
                            className="text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
                          >
                            Restaurar padrão
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <textarea
                    id={c}
                    rows={Math.min(4, Math.max(1, Math.ceil(textos[c].length / 80)))}
                    maxLength={TAMANHO_MAXIMO_MENSAGEM}
                    className={`${inputCls} ${erro ? "border-red-400 dark:border-red-700" : ""}`}
                    value={textos[c]}
                    onChange={(e) => alterar(c, e.target.value)}
                  />
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <code>{c}</code>
                    {vars.length > 0 && <span>Variáveis: {vars.map((v) => `{${v}}`).join(", ")}</span>}
                  </div>
                  {personalizada && (
                    <p className="mt-1 text-xs text-slate-500">
                      Padrão: <span className="italic">{def.padrao}</span>
                    </p>
                  )}
                  {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {alteradas.length === 0 ? "Nenhuma alteração pendente." : `${alteradas.length} alteração(ões) não salva(s).`}
          </span>
          <div className="flex items-center gap-3">
            {aviso && (
              <span className={`text-sm ${aviso.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {aviso.texto}
              </span>
            )}
            {alteradas.length > 0 && (
              <button
                type="button"
                onClick={() => setTextos(salvoTextos)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Descartar
              </button>
            )}
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={alteradas.length === 0 || Object.keys(erros).length > 0 || salvando || !bancoConfigurado}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
