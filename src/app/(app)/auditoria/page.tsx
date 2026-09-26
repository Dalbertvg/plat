import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fmtDateTime } from '@/lib/format';
import type { Prisma } from '@prisma/client';
import { lembrar } from '@/lib/cache-memoria';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 100;
// Tipos, entidades e atores novos são raros: as opções dos filtros podem
// ficar até 2 minutos defasadas. Os eventos da tabela são sempre atuais.
const VALIDADE_OPCOES_MS = 2 * 60 * 1000;

type SP = { tag?: string; entidade?: string; ator?: string; pagina?: string };

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const sp = await searchParams;
  const filterTag = sp.tag ?? 'all';
  const filterEntidade = sp.entidade ?? 'all';
  const filterAtor = sp.ator ?? 'all';
  const pagina = Math.min(1000, Math.max(1, Math.floor(Number(sp.pagina)) || 1));

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

  const [maisUm, { allTags, allEntidades, atores }] = await Promise.all([
    prisma.auditoria.findMany({
      where,
      orderBy: { quando: 'desc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA + 1,
      select: { id: true, quando: true, atorNome: true, perfil: true, msg: true, tag: true, entidade: true, entidadeId: true }
    }),
    // O escopo depende só do usuário, então a chave do cache é o id dele.
    lembrar(`auditoria:opcoes:${user.id}`, VALIDADE_OPCOES_MS, () => opcoesDosFiltros(escopoWhere))
  ]);
  const temMais = maisUm.length > POR_PAGINA;
  const entries = maisUm.slice(0, POR_PAGINA);

  const linkPagina = (p: number) => {
    const q = new URLSearchParams();
    if (filterTag !== 'all') q.set('tag', filterTag);
    if (filterEntidade !== 'all') q.set('entidade', filterEntidade);
    if (filterAtor !== 'all') q.set('ator', filterAtor);
    if (p > 1) q.set('pagina', String(p));
    const qs = q.toString();
    return qs ? `/auditoria?${qs}` : '/auditoria';
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[24px] sm:text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Auditoria</h1>
        <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
          {pagina === 1 && !temMais
            ? `${entries.length} eventos`
            : `Eventos ${(pagina - 1) * POR_PAGINA + (entries.length ? 1 : 0)}–${(pagina - 1) * POR_PAGINA + entries.length}, do mais recente para o mais antigo`} — cada movimento fica registrado.
        </p>
      </div>

      {user.perfil !== 'prefeito' && (
        <div className="rbac-note">
          <b>Escopo</b> ·{' '}
          {user.perfil === 'secretario' && 'você vê eventos das pessoas da sua secretaria E eventos sobre metas/ações da sua secretaria (incluindo cobranças feitas por qualquer nível superior).'}
          {user.perfil === 'chefe' && 'você vê eventos das pessoas da sua divisão E eventos sobre metas/ações da sua divisão (incluindo cobranças recebidas pela sua equipe).'}
        </div>
      )}

      {/* Filtros e paginação usam navegação normal do navegador (form GET / <a>),
          não o roteador do Next: com loading.tsx, trocar só os parâmetros da mesma
          tela pela segunda vez seguida era descartado pelo roteador (Next 15.5). */}
      <form action="/auditoria" className="filtros">
        <span className="filtros-largo font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>Filtros:</span>
        <select name="tag" defaultValue={filterTag} className="select select-filtro">
          <option value="all">Todos os tipos</option>
          {allTags.map(t => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
        </select>
        <select name="entidade" defaultValue={filterEntidade} className="select select-filtro">
          <option value="all">Todas as entidades</option>
          {allEntidades.map(e => <option key={e.entidade} value={e.entidade}>{e.entidade}</option>)}
        </select>
        <select name="ator" defaultValue={filterAtor} className="select select-filtro">
          <option value="all">Todos os atores</option>
          {atores.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <button type="submit" className="btn btn-sm justify-center">Aplicar</button>
      </form>

      <div className="tabela-rolavel" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-[88px] sm:w-[140px]">Quando</th>
              <th className="hidden md:table-cell" style={{ width: 180 }}>Ator</th>
              <th className="hidden lg:table-cell" style={{ width: 120 }}>Perfil</th>
              <th>Evento</th>
              <th className="hidden xl:table-cell" style={{ width: 180 }}>Tag</th>
              <th className="hidden xl:table-cell" style={{ width: 140 }}>Entidade</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td className="text-[12px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  {fmtDateTime(e.quando)}
                </td>
                <td className="hidden md:table-cell font-medium">{e.atorNome}</td>
                <td className="hidden lg:table-cell">
                  <span className={`pill ${pillForPerfil(e.perfil)}`}>{e.perfil}</span>
                </td>
                <td style={{ color: 'var(--ink-2)' }}>
                  {/* Telas estreitas: ator, tipo e entidade vêm junto do evento. */}
                  <div className="md:hidden font-medium" style={{ color: 'var(--ink)' }}>
                    {e.atorNome} <span className={`pill ${pillForPerfil(e.perfil)} ml-1`}>{e.perfil}</span>
                  </div>
                  {e.msg}
                  <div className="xl:hidden text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    <code style={{ fontSize: 11 }}>{e.tag}</code> · {e.entidade}
                  </div>
                </td>
                <td className="hidden xl:table-cell"><code style={{ fontSize: 11 }}>{e.tag}</code></td>
                <td className="hidden xl:table-cell text-[12px]" style={{ color: 'var(--ink-3)' }}>
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

      {(pagina > 1 || temMais) && (
        <nav className="flex items-center justify-between gap-3 mt-4" aria-label="Paginação">
          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Página {pagina}</span>
          <div className="flex gap-1.5">
            {pagina > 1 && <a href={linkPagina(pagina - 1)} className="btn btn-sm">← Mais recentes</a>}
            {temMais && <a href={linkPagina(pagina + 1)} className="btn btn-sm">Mais antigos →</a>}
          </div>
        </nav>
      )}
    </>
  );
}

// Opções dos três filtros numa consulta só, agrupada NO BANCO. (O `distinct`
// do Prisma trazia a tabela inteira para a memória, três vezes por acesso — e a
// auditoria é a tabela que mais cresce.) Uma linha por combinação existente de
// tipo × entidade × ator: poucas centenas.
async function opcoesDosFiltros(escopoWhere: Prisma.AuditoriaWhereInput | undefined) {
  const combinacoes = await prisma.auditoria.groupBy({
    by: ['tag', 'entidade', 'atorId'],
    where: escopoWhere
  });
  const allTags = Array.from(new Set(combinacoes.map(c => c.tag))).sort().map(tag => ({ tag }));
  const allEntidades = Array.from(new Set(combinacoes.map(c => c.entidade))).sort().map(entidade => ({ entidade }));
  // Atores no seletor de filtro: quem já apareceu na feed sob meu escopo.
  const atorIds = Array.from(new Set(combinacoes.map(c => c.atorId)));
  const atores = atorIds.length
    ? await prisma.usuario.findMany({
        where: { id: { in: atorIds } },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' }
      })
    : [];
  return { allTags, allEntidades, atores };
}

function pillForPerfil(perfil: string): string {
  if (perfil === 'prefeito') return 'pill-nav';
  if (perfil === 'secretario') return 'pill-brass';
  if (perfil === 'chefe') return 'pill-warn';
  return 'pill-neutral';
}
