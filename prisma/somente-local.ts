/**
 * Trava dos comandos de DESENVOLVIMENTO que recriam o banco ou inserem/apagam
 * dados de teste (db:reset, db:setup, test-metas:*). Só deixa passar quando a
 * DATABASE_URL aponta para esta máquina — assim um .env apontado por engano
 * para o banco de produção não apaga os dados do cliente.
 */
const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function recusar(motivo: string): never {
  console.error(`[somente-local] Comando RECUSADO: ${motivo}`);
  console.error('[somente-local] Ele apaga ou altera dados e só pode rodar no banco de desenvolvimento desta máquina.');
  process.exit(1);
}

if (process.env.RENDER === 'true' || process.env.NODE_ENV === 'production') {
  recusar('ambiente de produção.');
}

// Os comandos protegidos (Prisma CLI) leem o .env; esta checagem também.
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env'); } catch { /* sem .env: cai na recusa abaixo */ }
}

const bruta = process.env.DATABASE_URL ?? '';
let host = '';
try {
  host = new URL(bruta).hostname;
} catch {
  recusar('DATABASE_URL ausente ou inválida.');
}
if (!LOCAIS.has(host)) {
  recusar(`a DATABASE_URL aponta para "${host}", que não é esta máquina.`);
}
