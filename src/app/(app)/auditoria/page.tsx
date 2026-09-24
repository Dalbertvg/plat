import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fmtDateTime } from '@/lib/format';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

type SP = { tag?: string; entidade?: string; ator?: string };

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const sp = await searchParams;
  const filterTag = sp.tag ?? 'all';
  const filterEntidade = sp.entidade ?? 'all';
  const filterAtor = sp.ator ?? 'all';

  // RBAC de leitura da auditoria — dois critérios se combinam por OR:
  // (1) o ATOR está sob meu escopo hierárquico, OU
  // (2) a ENTIDADE (ação/meta) está sob meu escopo.
  // Isso resolve o caso "prefeito cobrou uma ação da minha secretaria" —
  // o ator (prefeito) não é lotado na minha secretaria, mas a AÇÃO é. Eu preciso ver.
  //
  // - prefeito: tudo
  // - secretario: (ator lotado na minha sec) OU (ação/meta com secretariaDona = minha) OU (própria)
  // - chefe: (ator lotado na minha div) OU (ação/meta com divisaoExecutora = minha) OU (própria)
  const secIdsUser = user.lotacoes.map(l => l.secretariaId);
  const divIdsUser = user.lotacoes.map(l => l.divisaoId).filter(Boolean) as string[];

  // IDs de entidades (ações e metas) que estão sob meu escopo hierárquico.
  // Prefeito não precisa desses filtros (vê tudo).
  let acaoIdsEscopo: string[] = [];
  let metaIdsEscopo: string[] = [];

  if (user.perfil !== 'prefeito') {
    const metasWhere: Prisma.MetaCPWhereInput =
      user.perfil === 'secretario'
        ? { secretariaDonaId: { in: secIdsUser } }
        : { divisaoExecutoraId: { in: divIdsUser } };

    const metasEscopo = await prisma.metaCP.findMany({
      where: metasWhere,
      select: { id: true }
    });
    metaIdsEscopo = metasEscopo.map(m => m.id);
    const acoesEscopo = metaIdsEscopo.length
      ? await prisma.acao.findMany({
          where: { metaCPId: { in: metaIdsEscopo } },
          select: { id: true }
        })
      : [];
    acaoIdsEscopo = acoesEscopo.map(a => a.id);
  }

  let atorIdsPermitidos: string[] | null = null;
  if (user.perfil === 'secretario') {
    const lots = await prisma.lotacao.findMany({
      where: { secretariaId: { in: secIdsUser } },
      select: { usuarioId: true }
    });
    atorIdsPermitidos = Array.from(new Set(lots.map(l => l.usuarioId)));
  } else if (user.perfil === 'chefe') {
    const lots = await prisma.lotacao.findMany({
      where: { divisaoId: { in: divIdsUser } },
      select: { usuarioId: true }
    });
    atorIdsPermitidos = Array.from(new Set(lots.map(l => l.usuarioId)));
  }

  // Filtro de visibilidade: prefeito vê tudo; outros veem se o ator OU a
  // entidade sob escopo bater. Sempre inclui as próprias entradas.
  const escopoWhere: Prisma.AuditoriaWhereInput | undefined = (() => {
    if (user.perfil === 'prefeito') return undefined;
    const ors: Prisma.AuditoriaWhereInput[] = [];
    if (atorIdsPermitidos && atorIdsPermitidos.length) {
      ors.push({ atorId: { in: atorIdsPermitidos } });
    }
    if (acaoIdsEscopo.length) {
      ors.push({ entidade: 'acao', entidadeId: { in: acaoIdsEscopo } });
    }
    if (metaIdsEscopo.length) {
      ors.push({ entidade: { in: ['meta', 'metacp'] }, entidadeId: { in: metaIdsEscopo } });
    }
    // Sempre inclui as próprias entradas do usuário (defesa em profundidade).
    ors.push({ atorId: user.id });
    return { OR: ors };
  })();

  const where: Prisma.AuditoriaWhereInput = {
    ...(escopoWhere ?? {}),
    ...(filterTag !== 'all' ? { tag: filterTag } : {}),
    ...(filterEntidade !== 'all' ? { entidade: filterEntidade } : {})
  };
  if (filterAtor !== 'all') {
    // Aplicado por cima do escopo — se o ator escolhido não estiver no escopo
    // permitido, o resultado ficará vazio (o OR ainda garante que "próprias
    // entradas" pareçam se atorAtual = filterAtor).
    where.atorId = filterAtor;
  }

  const [entries, allTags, allEntidades, atores] = await Promise.all([
    prisma.auditoria.findMany({
      where,
      orderBy: { quando: 'desc' },
      take: 300
    }),
    prisma.auditoria.findMany({
      where: escopoWhere,
      distinct: ['tag'],
      select: { tag: true },
      orderBy: { tag: 'asc' }
    }),
    prisma.auditoria.findMany({
      where: escopoWhere,
      distinct: ['entidade'],
      select: { entidade: true },
      orderBy: { entidade: 'asc' }
    }),
    // Atores no seletor de filtro: quem já apareceu na feed sob meu escopo.
    (async () => {
      const distinctAtores = await prisma.auditoria.findMany({
        where: escopoWhere,
        distinct: ['atorId'],
        select: { atorId: true }
      });
      const ids = distinctAtores.map(x => x.atorId);
      return ids.length
        ? prisma.usuario.findMany({
            where: { id: { in: ids } },
            select: { id: true, nome: true },
            orderBy: { nome: 'asc' }
          })
        : [];
    })()
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Auditoria</h1>
        <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
          {entries.length === 300 ? 'Últimos 300 eventos' : `${entries.length} eventos`} — cada movimento fica registrado.
        </p>
      </div>

      {user.perfil !== 'prefeito' && (
        <div className="rbac-note">
          <b>Escopo</b> ·{' '}
          {user.perfil === 'secretario' && 'você vê eventos das pessoas da sua secretaria E eventos sobre metas/ações da sua secretaria (incluindo cobranças feitas por qualquer nível superior).'}
          {user.perfil === 'chefe' && 'você vê eventos das pessoas da sua divisão E eventos sobre metas/ações da sua divisão (incluindo cobranças recebidas pela sua equipe).'}
        </div>
      )}

      <form className="flex gap-2 mb-4 items-center flex-wrap">
        <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>Filtros:</span>
        <select name="tag" defaultValue={filterTag} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todos os tipos</option>
          {allTags.map(t => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
        </select>
        <select name="entidade" defaultValue={filterEntidade} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todas as entidades</option>
          {allEntidades.map(e => <option key={e.entidade} value={e.entidade}>{e.entidade}</option>)}
        </select>
        <select name="ator" defaultValue={filterAtor} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todos os atores</option>
          {atores.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <button type="submit" className="btn btn-sm">Aplicar</button>
      </form>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Quando</th>
              <th style={{ width: 180 }}>Ator</th>
              <th style={{ width: 120 }}>Perfil</th>
              <th>Evento</th>
              <th style={{ width: 180 }}>Tag</th>
              <th style={{ width: 140 }}>Entidade</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td className="text-[12px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  {fmtDateTime(e.quando)}
                </td>
                <td className="font-medium">{e.atorNome}</td>
                <td>
                  <span className={`pill ${pillForPerfil(e.perfil)}`}>{e.perfil}</span>
                </td>
                <td style={{ color: 'var(--ink-2)' }}>{e.msg}</td>
                <td><code style={{ fontSize: 11 }}>{e.tag}</code></td>
                <td className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  {e.entidade} · <code>{e.entidadeId}</code>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: 'var(--ink-3)' }}>Nenhum evento encontrado com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function pillForPerfil(perfil: string): string {
  if (perfil === 'prefeito') return 'pill-nav';
  if (perfil === 'secretario') return 'pill-brass';
  if (perfil === 'chefe') return 'pill-warn';
  return 'pill-neutral';
}
