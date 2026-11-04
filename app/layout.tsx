import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeRise · Integração Suri x GFSIS",
  description: "Painel de erros da integração Suri x GFSIS",
  robots: { index: false, follow: false },
};

// Aplica o tema antes da pintura para evitar "flash" de tema errado.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
