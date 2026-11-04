"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegrasNegocio, RegrasResolvidas } from "@/lib/settings";
import { formatDataCurta, nowInTz, proximosDiasAtendimento } from "@/lib/time";

const DIAS = [
  { valor: 1, curto: "Seg", nome: "Segunda" },
  { valor: 2, curto: "Ter", nome: "Terça" },
  { valor: 3, curto: "Qua", nome: "Quarta" },
  { valor: 4, curto: "Qui", nome: "Quinta" },
  { valor: 5, curto: "Sex", nome: "Sexta" },
  { valor: 6, curto: "Sáb", nome: "Sábado" },
  { valor: 0, curto: "Dom", nome: "Domingo" },
];

const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-900";

function iguais(a: RegrasNegocio, b: RegrasNegocio): boolean {
  return (
    a.tzNegocio === b.tzNegocio &&
    a.antecedenciaMinimaMinutos === b.antecedenciaMinimaMinutos &&
    [...a.diasAtendimento].sort().join() === [...b.diasAtendimento].sort().join()
  );
}

export function ConfiguracoesForm({
  inicial,
  padrao,
  fusos,
  bancoConfigurado,
}: {
  inicial: RegrasResolvidas;
  padrao: RegrasNegocio;
  fusos: Array<{ value: string; label: string }>;
  bancoConfigurado: boolean;
}) {
  const [salvo, setSalvo] = useState<RegrasResolvidas>(inicial);
  const [tz, setTz] = useState(inicial.tzNegocio);
  const [dias, setDias] = useState<number[]>(inicial.diasAtendimento);
  const [antecedencia, setAntecedencia] = useState(String(inicial.antecedenciaMinimaMinutos));
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const opcoesFuso = useMemo(
    () => (fusos.some((f) => f.value === tz) ? fusos : [{ value: tz, label: tz }, ...fusos]),
    [fusos, tz],
  );

  const antecedenciaNum = Number(antecedencia);
  const antecedenciaValida = antecedencia !== "" && Number.isInteger(antecedenciaNum) && antecedenciaNum >= 0 && antecedenciaNum <= 1440;
  const atual: RegrasNegocio = { tzNegocio: tz, diasAtendimento: dias, antecedenciaMinimaMinutos: antecedenciaNum };
  const alterado = !iguais(atual, salvo);
  const valido = dias.length > 0 && antecedenciaValida;

  const previa = useMemo(() => {
    const agora = nowInTz(tz, new Date(agoraMs));
    const [y, m, d] = agora.date.split("-");
    return {
      agora: `${d}/${m}/${y} ${agora.time}`,
      proximos: proximosDiasAtendimento(agora.date, 5, new Set(dias)).map(formatDataCurta),
    };
  }, [tz, dias, agoraMs]);

  const alternarDia = (valor: number) =>
    setDias((atuais) => (atuais.includes(valor) ? atuais.filter((d) => d !== valor) : [...atuais, valor]));

  const restaurarPadrao = () => {
    setTz(padrao.tzNegocio);
    setDias(padrao.diasAtendimento);
    setAntecedencia(String(padrao.antecedenciaMinimaMinutos));
    setAviso(null);
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atual),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = (await res.json()) as { ok: boolean; message?: string; regras?: RegrasResolvidas };
      if (!json.ok || !json.regras) throw new Error(json.message ?? "Falha ao salvar");
      setSalvo(json.regras);
      setDias(json.regras.diasAtendimento);
      setAviso({ ok: true, texto: "Configurações salvas. Elas passam a valer em até 30 segundos." });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regras de negócio</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Definem como a Suri oferece e valida horários de agendamento.{" "}
          {salvo.origem === "banco" ? (
            <>
              Última alteração em{" "}
              {new Date(salvo.atualizadoEm!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {salvo.atualizadoPor ? ` por ${salvo.atualizadoPor}` : ""}.
            </>
          ) : (
            <>Usando os valores padrão das variáveis de ambiente (nada salvo ainda).</>
          )}
        </p>
      </div>

      {!bancoConfigurado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Banco de dados não configurado (DATABASE_URL). Dá para ver as regras, mas não salvar.
        </div>
      )}

      <section className={card}>
        <label htmlFor="tz" className="block font-medium">Fuso horário</label>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Usado para saber o que é &quot;hoje&quot;, o dia da semana e se um horário já passou.
        </p>
        <select id="tz" className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)}>
          {opcoesFuso.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">Agora nesse fuso: <strong>{previa.agora}</strong></p>
      </section>

      <section className={card}>
        <div className="font-medium">Dias de atendimento</div>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Só esses dias são consultados no GFSIS ao buscar horários.
        </p>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => {
            const ativo = dias.includes(d.valor);
            return (
              <button
                key={d.valor}
                type="button"
                title={d.nome}
                aria-pressed={ativo}
                onClick={() => alternarDia(d.valor)}
                className={`min-w-14 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  ativo
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
        {dias.length === 0 ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">Selecione ao menos um dia.</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Próximos 5 dias de atendimento: {previa.proximos.join(", ")}</p>
        )}
      </section>

      <section className={card}>
        <label htmlFor="antecedencia" className="block font-medium">Antecedência mínima (minutos)</label>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Horários de hoje que começam dentro desse intervalo não são oferecidos. Exemplo: com 30, às 08:45 o primeiro
          horário oferecido é depois das 09:15.
        </p>
        <input
          id="antecedencia"
          type="number"
          min={0}
          max={1440}
          step={5}
          className={`${inputCls} max-w-40`}
          value={antecedencia}
          onChange={(e) => setAntecedencia(e.target.value)}
        />
        {!antecedenciaValida && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Informe um número inteiro entre 0 e 1440.</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={restaurarPadrao}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Restaurar padrão
        </button>
        <div className="flex items-center gap-3">
          {aviso && (
            <span className={`text-sm ${aviso.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {aviso.texto}
            </span>
          )}
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!alterado || !valido || salvando || !bancoConfigurado}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
