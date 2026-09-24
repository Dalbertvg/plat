import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, filterVisibleMetas } from '@/lib/rbac';
import { fmtPct, pctFromAcoes, calcPrazoMetaFinal, fmtMesAno } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MetasPage({ searchParams }: { searchParams: Promise<{ sec?: string; status?: string; tipo?: string; arquivada?: string }> }) {
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

  const [secretarias, divisoes, metasCP, acoes, participantes] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.divisao.findMany(),
    prisma.metaCP.findMany({ orderBy: { id: 'asc' } }),
    prisma.acao.findMany(),
    prisma.metaCPParticipante.findMany()
  ]);

  const visibleMetas = filterVisibleMetas(user, metasCP, participantes);
  const visibleSecIds = new Set(visibleMetas.map(m => m.secretariaDonaId));
  const filtered = visibleMetas.filter(m => {
    if (filterArquivada === 'ativas' && m.arquivada) return false;
    if (filterArquivada === 'arquivadas' && !m.arquivada) return false;
    if (filterSec !== 'all' && m.secretariaDonaId !== filterSec) return false;
    if (filterTipo !== 'all' && m.tipo !== filterTipo) return false;
    if (filterStatus !== 'all') {
      const pct = pctFromAcoes(acoes.filter(a => a.metaCPId === m.id));
      if (filterStatus === 'concluida' && pct < 0.99) return false;
      if (filterStatus === 'andamento' && (pct >= 0.99 || pct === 0)) return false;
      if (filterStatus === 'nao_iniciada' && pct > 0) return false;
    }
    return true;
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Metas</h1>
        <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
          {filtered.length} de {visibleMetas.length} metas visíveis com seu perfil.
        </p>
      </div>

      <form className="flex gap-2 mb-4 items-center flex-wrap">
        <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>Filtros:</span>
        <select name="sec" defaultValue={filterSec} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todas as secretarias</option>
          {secretarias.filter(s => visibleSecIds.has(s.id)).map(s => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        <select name="status" defaultValue={filterStatus} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todos os status</option>
          <option value="nao_iniciada">Não iniciada</option>
          <option value="andamento">Em andamento</option>
          <option value="concluida">Concluída</option>
        </select>
        <select name="tipo" defaultValue={filterTipo} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Principal + secundária</option>
          <option value="principal">Só plano de governo</option>
          <option value="secundaria">Só secundárias</option>
        </select>
        <select name="arquivada" defaultValue={filterArquivada} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="ativas">Só ativas</option>
          <option value="arquivadas">Só arquivadas</option>
          <option value="todas">Ativas + arquivadas</option>
        </select>
        <button type="submit" className="btn btn-sm">Aplicar</button>
        <div className="flex-1" />
        {(user.perfil === 'prefeito' || user.perfil === 'secretario') && (
          <Link href="/metas/nova" className="btn btn-brass btn-sm">+ Nova meta</Link>
        )}
        {can(user, 'proposta.submit') && (
          <Link href="/propostas/nova" className="btn btn-primary btn-sm">+ Nova proposta</Link>
        )}
      </form>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>Meta</th>
              <th>Secretaria · Divisão</th>
              <th style={{ width: '16%' }}>Progresso</th>
              <th style={{ width: 110 }}>Prazo</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const s = secretarias.find(x => x.id === m.secretariaDonaId);
              const d = divisoes.find(x => x.id === m.divisaoExecutoraId);
              const acs = acoes.filter(a => a.metaCPId === m.id);
              const pct = pctFromAcoes(acs);
              const bar = pct < 0.3 ? 'late' : pct < 0.7 ? 'warn' : '';
              const prazoMeta = calcPrazoMetaFinal(acs);
              return (
                <tr key={m.id} style={m.arquivada ? { opacity: 0.6 } : undefined}>
                  <td><code>{m.id}</code></td>
                  <td className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/metas/${m.id}`} className="hover:underline" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                        {m.nome}
                      </Link>
                      {m.tipo === 'principal' && (
                        <span className="pill pill-nav" title="Compromisso do plano de governo">plano de governo</span>
                      )}
                      {m.arquivada && (
                        <span className="pill pill-neutral" title={m.arquivadaJustificativa ?? undefined}>arquivada</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div>{s?.nome}</div>
                    <div className="text-[11px] italic" style={{ color: 'var(--brass)' }}>{d?.nome}</div>
                  </td>
                  <td>
                    <div className="grid grid-cols-[1fr_40px] gap-2 items-center">
                      <div className="progress"><div className={`progress-bar ${bar}`} style={{ width: `${pct * 100}%` }} /></div>
                      <div className="font-mono text-[11px] text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtPct(pct)}</div>
                    </div>
                  </td>
                  <td className="text-[12px]" style={{ color: 'var(--ink-2)' }}>{prazoMeta ? fmtMesAno(prazoMeta) : '—'}</td>
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
    </>
  );
}
