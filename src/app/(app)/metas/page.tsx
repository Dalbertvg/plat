import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, metasVisiveisWhere } from '@/lib/rbac';
import { fmtPct, pctFromAcoes, calcPrazoMetaFinal, fmtMesAno } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Linhas por página: a tabela inteira (centenas de metas) passava de 700 KB.
const POR_PAGINA = 50;

type Filtros = { sec?: string; status?: string; tipo?: string; arquivada?: string; pagina?: string };

export default async function MetasPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const sp = await searchParams;
  const filterStatus = sp.status ?? 'all';
  const filterTipo = sp.tipo ?? 'all';
  // Metas arquivadas ficam fora da lista por padrão — não é mais um item ativo
  // pra acompanhar, mas o histórico continua acessível por este filtro.
  const filterArquivada = sp.arquivada ?? 'ativas';

  // Default do filtro de secretaria depende do perfil:
  //  - Secretário: abre já com a própria secretaria selecionada
  //    (se tiver mais de uma lotação, escolhe a primeira; pode trocar para "todas" no filtro)
  //  - Chefe/funcionário: pré-seleciona a própria secretaria também
  //  - Prefeito: "todas" (visão global)
  const secDefault = (() => {
    if (user.perfil === 'prefeito') return 'all';
    return user.lotacoes[0]?.secretariaId ?? 'all';
  })();
  // Distingue "filtro não informado" (usa default) de "usuário escolheu all" (respeitar):
  const filterSec = sp.sec !== undefined ? sp.sec : secDefault;

  // Visibilidade aplicada no banco, e só as colunas que a tabela usa.
  const metaWhere = metasVisiveisWhere(user);
  const [secretarias, divisoes, visibleMetas, acoes] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.divisao.findMany({ select: { id: true, nome: true } }),
    prisma.metaCP.findMany({
      where: metaWhere,
      orderBy: { id: 'asc' },
      select: {
        id: true, nome: true, tipo: true, secretariaDonaId: true, divisaoExecutoraId: true,
        arquivada: true, arquivadaJustificativa: true
      }
    }),
    prisma.acao.findMany({
      where: user.perfil === 'prefeito' ? {} : { metaCP: metaWhere },
      select: { metaCPId: true, situacaoAtual: true, peso: true, inicio: true, tempoNecessario: true }
    })
  ]);

  // Uma passada só: ações agrupadas por meta, em vez de filtrar a lista
  // inteira de ações para cada linha da tabela.
  const acoesPorMeta = new Map<string, typeof acoes>();
  for (const a of acoes) {
    const arr = acoesPorMeta.get(a.metaCPId);
    if (arr) arr.push(a); else acoesPorMeta.set(a.metaCPId, [a]);
  }
  const secretariaNome = new Map(secretarias.map(s => [s.id, s.nome]));
  const divisaoNome = new Map(divisoes.map(d => [d.id, d.nome]));

  const visibleSecIds = new Set(visibleMetas.map(m => m.secretariaDonaId));
  const filtered = visibleMetas.filter(m => {
    if (filterArquivada === 'ativas' && m.arquivada) return false;
    if (filterArquivada === 'arquivadas' && !m.arquivada) return false;
    if (filterSec !== 'all' && m.secretariaDonaId !== filterSec) return false;
    if (filterTipo !== 'all' && m.tipo !== filterTipo) return false;
    if (filterStatus !== 'all') {
      const pct = pctFromAcoes(acoesPorMeta.get(m.id) ?? []);
      if (filterStatus === 'concluida' && pct < 0.99) return false;
      if (filterStatus === 'andamento' && (pct >= 0.99 || pct === 0)) return false;
      if (filterStatus === 'nao_iniciada' && pct > 0) return false;
    }
    return true;
  });

  const totalPaginas = Math.max(1, Math.ceil(filtered.length / POR_PAGINA));
  const pagina = Math.min(totalPaginas, Math.max(1, Math.floor(Number(sp.pagina)) || 1));
  const paginaAtual = filtered.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const linkPagina = (p: number) => {
    const q = new URLSearchParams();
    if (sp.sec !== undefined) q.set('sec', filterSec);
    if (filterStatus !== 'all') q.set('status', filterStatus);
    if (filterTipo !== 'all') q.set('tipo', filterTipo);
    if (filterArquivada !== 'ativas') q.set('arquivada', filterArquivada);
    if (p > 1) q.set('pagina', String(p));
    const qs = q.toString();
    return qs ? `/metas?${qs}` : '/metas';
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[24px] sm:text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Metas</h1>
        <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
          {filtered.length} de {visibleMetas.length} metas visíveis com seu perfil.
        </p>
      </div>

      {/* Filtros e paginação usam navegação normal do navegador (form GET / <a>),
          não o roteador do Next: com loading.tsx, trocar só os parâmetros da mesma
          tela pela segunda vez seguida era descartado pelo roteador (Next 15.5). */}
      <form action="/metas" className="filtros">
        <span className="filtros-largo font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>Filtros:</span>
        <select name="sec" defaultValue={filterSec} className="select select-filtro">
          <option value="all">Todas as secretarias</option>
          {secretarias.filter(s => visibleSecIds.has(s.id)).map(s => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        <select name="status" defaultValue={filterStatus} className="select select-filtro">
          <option value="all">Todos os status</option>
          <option value="nao_iniciada">Não iniciada</option>
          <option value="andamento">Em andamento</option>
          <option value="concluida">Concluída</option>
        </select>
        <select name="tipo" defaultValue={filterTipo} className="select select-filtro">
          <option value="all">Principal + secundária</option>
          <option value="principal">Só plano de governo</option>
          <option value="secundaria">Só secundárias</option>
        </select>
        <select name="arquivada" defaultValue={filterArquivada} className="select select-filtro">
          <option value="ativas">Só ativas</option>
          <option value="arquivadas">Só arquivadas</option>
          <option value="todas">Ativas + arquivadas</option>
        </select>
        <button type="submit" className="btn btn-sm justify-center">Aplicar</button>
        <div className="hidden md:block flex-1" />
        {(user.perfil === 'prefeito' || user.perfil === 'secretario') && (
          <Link href="/metas/nova" className="btn btn-brass btn-sm justify-center">+ Nova meta</Link>
        )}
        {can(user, 'proposta.submit') && (
          <Link href="/propostas/nova" className="btn btn-primary btn-sm justify-center">+ Nova proposta</Link>
        )}
      </form>

      <div className="tabela-rolavel" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="hidden lg:table-cell">ID</th>
              <th>Meta</th>
              <th className="hidden md:table-cell">Secretaria · Divisão</th>
              <th style={{ width: '16%', minWidth: 96 }}>Progresso</th>
              <th className="hidden sm:table-cell" style={{ width: 110 }}>Prazo</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginaAtual.map(m => {
              const acs = acoesPorMeta.get(m.id) ?? [];
              const pct = pctFromAcoes(acs);
              const bar = pct < 0.3 ? 'late' : pct < 0.7 ? 'warn' : '';
              const prazoMeta = calcPrazoMetaFinal(acs);
              return (
                <tr key={m.id} style={m.arquivada ? { opacity: 0.6 } : undefined}>
                  <td className="hidden lg:table-cell"><code>{m.id}</code></td>
                  <td className="font-medium">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <Link href={`/metas/${m.id}`} prefetch={false} className="hover:underline" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                        {m.nome}
                      </Link>
                      {m.tipo === 'principal' && (
                        <span className="pill pill-nav" title="Compromisso do plano de governo">plano de governo</span>
                      )}
                      {m.arquivada && (
                        <span className="pill pill-neutral" title={m.arquivadaJustificativa ?? undefined}>arquivada</span>
                      )}
                    </div>
                    {/* Telas estreitas: secretaria e prazo aparecem aqui em vez das colunas. */}
                    <div className="md:hidden text-[12px] font-normal mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      {secretariaNome.get(m.secretariaDonaId)}
                      <span className="sm:hidden">{prazoMeta ? ` · prazo ${fmtMesAno(prazoMeta)}` : ''}</span>
                    </div>
                  </td>
                  <td className="hidden md:table-cell">
                    <div>{secretariaNome.get(m.secretariaDonaId)}</div>
                    <div className="text-[11px] italic" style={{ color: 'var(--brass)' }}>{divisaoNome.get(m.divisaoExecutoraId)}</div>
                  </td>
                  <td>
                    <div className="grid grid-cols-[1fr_40px] gap-2 items-center">
                      <div className="progress"><div className={`progress-bar ${bar}`} style={{ width: `${pct * 100}%` }} /></div>
                      <div className="font-mono text-[11px] text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtPct(pct)}</div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-[12px]" style={{ color: 'var(--ink-2)' }}>{prazoMeta ? fmtMesAno(prazoMeta) : '—'}</td>
                  <td style={{ textAlign: 'right' }}><code>{acs.length}</code></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: 'var(--ink-3)' }}>Nenhuma meta encontrada com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <nav className="flex items-center justify-between gap-3 mt-4 flex-wrap" aria-label="Paginação">
          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
            Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {pagina > 1 && <a href={linkPagina(pagina - 1)} className="btn btn-sm">← Anterior</a>}
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(p => (
              p === pagina
                ? <span key={p} className="btn btn-sm btn-primary" aria-current="page">{p}</span>
                : <a key={p} href={linkPagina(p)} className="btn btn-sm btn-ghost">{p}</a>
            ))}
            {pagina < totalPaginas && <a href={linkPagina(pagina + 1)} className="btn btn-sm">Próxima →</a>}
          </div>
        </nav>
      )}
    </>
  );
}
