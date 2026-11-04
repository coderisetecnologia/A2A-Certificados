/**
 * Cria a tabela error_logs e índices no Neon.
 * Uso: npm run db:migrate   (lê DATABASE_URL do ambiente ou de .env.local / .env)
 */
import { neon } from "@neondatabase/serverless";
import { MIGRATION_SQL } from "../lib/db";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // arquivo opcional
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida. Configure em .env.local ou no ambiente.");
    process.exit(1);
  }
  const sql = neon(url);
  for (const statement of MIGRATION_SQL) {
    const first = statement.split("\n")[0]!.trim();
    process.stdout.write(`→ ${first}\n`);
    await sql.query(statement);
  }
  console.log("✔ Migration concluída.");
}

main().catch((err) => {
  console.error("✖ Falha na migration:", (err as Error).message);
  process.exit(1);
});
