/**
 * TRAVA DE SEGURANÇA DOS DADOS — roda antes de `prisma migrate deploy` em
 * todo start (produção e o .bat local). Ver package.json → "db:deploy".
 *
 * Uma atualização do sistema nunca pode apagar nem alterar o que o cliente já
 * lançou. Migrações normais (criar tabela, coluna nova, índice) passam direto.
 * Se alguma migração AINDA NÃO APLICADA neste banco contiver um comando que
 * apaga ou reescreve dados (DROP TABLE, DROP COLUMN, DELETE, UPDATE, TRUNCATE,
 * troca de tipo de coluna, renomeação), o start é cancelado ANTES de tocar no
 * banco: nada muda e, no Render, a versão anterior continua no ar.
 *
 * Para aplicar uma migração dessas de propósito (depois de fazer backup):
 * defina MIGRACAO_DESTRUTIVA_AUTORIZADA com o nome exato da pasta da migração
 * (várias separadas por vírgula), faça o deploy e REMOVA a variável depois.
 *
 * Banco novo (sem a tabela _prisma_migrations) não tem dados: passa direto.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PASTA = path.resolve(__dirname, 'migrations');

const PERIGOSOS: Array<{ re: RegExp; motivo: string }> = [
  { re: /\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i, motivo: 'apaga uma tabela inteira' },
  { re: /\bDROP\s+COLUMN\b/i, motivo: 'apaga uma coluna (e os valores gravados nela)' },
  { re: /\bTRUNCATE\b/i, motivo: 'esvazia uma tabela' },
  { re: /\bDELETE\s+FROM\b/i, motivo: 'apaga registros' },
  { re: /\bUPDATE\s+[\w."]+\s+SET\b/i, motivo: 'altera valores já gravados' },
  { re: /\bALTER\s+COLUMN\s+[\w"]+\s+(SET\s+DATA\s+)?TYPE\b/i, motivo: 'muda o tipo de uma coluna (pode cortar ou perder valores)' },
  { re: /\bRENAME\s+(COLUMN|TO)\b/i, motivo: 'renomeia tabela ou coluna (a versão em uso deixa de achar os dados)' }
];

// Comentários não contam: o Prisma escreve avisos como
// "-- You are about to drop the column" dentro de comentários.
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function analisarMigracao(sql: string): string[] {
  const limpo = semComentarios(sql);
  return PERIGOSOS.filter(p => p.re.test(limpo)).map(p => p.motivo);
}

type Aplicada = { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };

async function main() {
  const locais = fs.readdirSync(PASTA, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(PASTA, d.name, 'migration.sql')))
    .map(d => d.name)
    .sort();

  const prisma = new PrismaClient();
  try {
    const [{ existe }] = await prisma.$queryRaw<Array<{ existe: boolean }>>`
      SELECT to_regclass('_prisma_migrations') IS NOT NULL AS existe`;
    if (!existe) {
      console.log(`[migracoes] Banco novo: ${locais.length} migração(ões) serão aplicadas.`);
      return;
    }

    const aplicadas = await prisma.$queryRaw<Aplicada[]>`
      SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations`;
    const concluidas = new Map(
      aplicadas.filter(a => a.finished_at && !a.rolled_back_at).map(a => [a.migration_name, a])
    );

    const falhas = aplicadas.filter(a => !a.finished_at && !a.rolled_back_at);
    if (falhas.length) {
      console.error(
        `[migracoes] Uma migração anterior falhou no meio: ${falhas.map(f => f.migration_name).join(', ')}.\n` +
        '[migracoes] O Prisma não aplica mais nada até isso ser resolvido manualmente ' +
        '(ver "Atualizações seguras" em ESTRUTURA-DO-PROJETO.md). Nenhum dado foi alterado agora.'
      );
      process.exit(1);
    }

    // Avisos que não bloqueiam: migração já aplicada que foi editada depois
    // (a edição NÃO será aplicada) e banco à frente do código (versão antiga).
    for (const nome of locais) {
      const aplicada = concluidas.get(nome);
      if (!aplicada) continue;
      const soma = createHash('sha256').update(fs.readFileSync(path.join(PASTA, nome, 'migration.sql'))).digest('hex');
      if (soma !== aplicada.checksum) {
        console.warn(`[migracoes] AVISO: "${nome}" foi editada depois de aplicada — a edição não vale. Mudanças vão sempre em uma migração NOVA.`);
      }
    }
    const desconhecidas = [...concluidas.keys()].filter(n => !locais.includes(n));
    if (desconhecidas.length) {
      console.warn(`[migracoes] AVISO: o banco tem migrações que este código não conhece (${desconhecidas.join(', ')}). Está publicando uma versão antiga?`);
    }

    const pendentes = locais.filter(n => !concluidas.has(n));
    if (!pendentes.length) {
      console.log('[migracoes] Banco em dia — nenhuma migração pendente.');
      return;
    }

    const autorizadas = new Set(
      (process.env.MIGRACAO_DESTRUTIVA_AUTORIZADA ?? '').split(',').map(s => s.trim()).filter(Boolean)
    );
    const bloqueadas: string[] = [];
    for (const nome of pendentes) {
      const motivos = analisarMigracao(fs.readFileSync(path.join(PASTA, nome, 'migration.sql'), 'utf8'));
      if (!motivos.length) continue;
      if (autorizadas.has(nome)) {
        console.warn(`[migracoes] ATENÇÃO: "${nome}" ${motivos.join('; ')} — aplicando porque foi AUTORIZADA em MIGRACAO_DESTRUTIVA_AUTORIZADA. Remova a variável após o deploy.`);
        continue;
      }
      bloqueadas.push(`[migracoes]   - ${nome}: ${motivos.join('; ')}`);
    }

    if (bloqueadas.length) {
      console.error(
        '[migracoes] START CANCELADO para proteger os dados já lançados. Estas migrações pendentes apagariam ou alterariam dados:\n' +
        bloqueadas.join('\n') + '\n' +
        '[migracoes] Nada foi alterado no banco. Prefira uma migração que só ACRESCENTE (coluna nova, tabela nova).\n' +
        '[migracoes] Se for mesmo intencional: faça backup do banco, defina MIGRACAO_DESTRUTIVA_AUTORIZADA=<nome da pasta> e publique de novo.'
      );
      process.exit(1);
    }

    console.log(`[migracoes] ${pendentes.length} migração(ões) a aplicar: ${pendentes.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('[migracoes] Não foi possível verificar as migrações:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
