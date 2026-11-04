import Link from "next/link";
import { Logo } from "@/app/components";

export default async function AcessoNegadoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const negado = !error || error === "AccessDenied";
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Logo className="mb-6 justify-center" />
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-100 text-2xl dark:bg-red-950">🚫</div>
        <h1 className="text-xl font-semibold">{negado ? "Acesso negado" : "Erro ao entrar"}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {negado
            ? "Esta conta Google não tem permissão para acessar o painel."
            : error === "Configuration"
              ? "O login está com a configuração do servidor incompleta. Verifique as variáveis de ambiente do Auth.js."
              : "Não foi possível concluir o login. Tente novamente."}
        </p>
        {!negado && error && (
          <p className="mt-2 font-mono text-xs text-slate-400">Código: {error.slice(0, 40)}</p>
        )}
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Voltar ao login
        </Link>
      </div>
    </main>
  );
}
