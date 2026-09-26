import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

// Tamanho do pool de conexões com o Postgres. Sem isto o Prisma abre
// (núcleos da máquina × 2 + 1) conexões — em hospedagem compartilhada o
// processo enxerga os núcleos do servidor físico, e cada conexão custa memória
// num Postgres pequeno (256 MB). O site é limitado por CPU, não por conexões:
// 5 atendem com folga. Ajustável por DB_CONEXOES, ou por `connection_limit`
// já presente na própria DATABASE_URL (que tem prioridade).
function urlComPool(): string | undefined {
  const bruta = process.env.DATABASE_URL;
  if (!bruta) return undefined;
  try {
    const url = new URL(bruta);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.DB_CONEXOES ?? '5');
    }
    return url.toString();
  } catch {
    return bruta;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: urlComPool(),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
