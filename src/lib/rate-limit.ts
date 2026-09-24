import 'server-only';
import { prisma } from './db';

export type Limite = { max: number; janelaMs: number };
export type ResultadoLimite = { ok: boolean; reiniciaEm: Date };

const MINUTO = 60 * 1000;

export const LIMITES = {
  loginPorIp: { max: 20, janelaMs: 15 * MINUTO },
  loginPorEmail: { max: 5, janelaMs: 15 * MINUTO }
} satisfies Record<string, Limite>;

// Janela fixa, atômica no Postgres: o upsert do Prisma vira um único
// INSERT … ON CONFLICT DO UPDATE, então requisições paralelas não "furam" o
// limite. Conta a tentativa ANTES de processá-la (consumo), não depois.
export async function consumirLimite(chave: string, { max, janelaMs }: Limite): Promise<ResultadoLimite> {
  const agora = new Date();
  const novaExpiracao = new Date(agora.getTime() + janelaMs);

  await prisma.rateLimit.updateMany({
    where: { chave, expiraEm: { lte: agora } },
    data: { contagem: 0, expiraEm: novaExpiracao }
  });

  const registro = await prisma.rateLimit.upsert({
    where: { chave },
    create: { chave, contagem: 1, expiraEm: novaExpiracao },
    update: { contagem: { increment: 1 } }
  });

  if (Math.random() < 0.02) {
    prisma.rateLimit.deleteMany({ where: { expiraEm: { lt: agora } } }).catch(() => {});
  }

  return { ok: registro.contagem <= max, reiniciaEm: registro.expiraEm };
}

export async function zerarLimite(chave: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { chave } });
}

// Qual cabeçalho é confiável depende de QUEM está na frente do app:
//  - VPS + Nginx (padrão): o Nginx sobrescreve X-Real-IP com o IP da conexão;
//    sem ele, vale o ÚLTIMO item do X-Forwarded-For (o que o proxy anexou) —
//    os primeiros são controlados pelo cliente e podem ser forjados.
//  - Render (IP_CLIENTE_XFF=primeiro): o edge do Render grava o IP real do
//    cliente como PRIMEIRO item e os últimos são IPs dos próprios proxies.
//    Ler o último faria todos os usuários dividirem o mesmo limite de login.
export function ipDoCliente(headers: Headers): string {
  const partes = (headers.get('x-forwarded-for') ?? '').split(',').map(p => p.trim()).filter(Boolean);

  if (process.env.IP_CLIENTE_XFF === 'primeiro') return partes[0] ?? 'desconhecido';

  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return partes[partes.length - 1] ?? 'desconhecido';
}
