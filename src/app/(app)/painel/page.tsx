import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fmtPct, fmtDateTime, pctFromAcoes, computeStatusAcao, calcPrazoFinal } from '@/lib/format';
import {
  carregarBasePainel, carregarNomesOrganizacao, situacoesPassadas, DIAS_CORTE,
  classificarAtrasadas, detalharAtrasadas, type AcaoPainel
} from '@/lib/painel';
import Link from 'next/link';
import { RankingSecretarias, type PeriodKey, type SecStat } from './RankingSecretarias';
import { AcoesAtrasadas } from './AcoesAtrasadas';
import { ProximosPrazos, type PrazoRow } from './ProximosPrazos';

export const dynamic = 'force-dynamic';

// Índice de cada janela no vetor devolvido por situacoesPassadas() (mesma
// ordem de DIAS_CORTE). O período "total" compara com o início: situação
// passada = 0 para todas as ações, sem consulta.
const PERIOD_INDEX: Record<Exclude<PeriodKey, 'total'>, number> = {
  '30d': DIAS_CORTE.indexOf(30),
  '60d': DIAS_CORTE.indexOf(60),
  '90d': DIAS_CORTE.indexOf(90),
  '180d': DIAS_CORTE.indexOf(180),
  '360d': DIAS_CORTE.indexOf(360)
};
const PERIOD_KEYS: PeriodKey[] = ['30d', '60d', '90d', '180d', '360d', 'total'];

export default async function PainelPage() {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const [{ metas: metasCP, acoes: visibleAcoes }, nomes, sitPassada, propostasPendentes, propostasResolvidas] = await Promise.all([
    carregarBasePainel(user),
    carregarNomesOrganizacao(),
    situacoesPassadas(),
    loadPropostasPendentes(user),
    loadPropostasResolvidasDoAutor(user)
  ]);

  const now = Date.now();
  const hoje = new Date(now);

  // Agrupa as ações por meta uma única vez (evita filtrar a lista inteira
  // para cada meta, secretaria e período).
  const acoesPorMeta = new Map<string, AcaoPainel[]>();
  for (const a of visibleAcoes) {
    const arr = acoesPorMeta.get(a.metaCPId);
    if (arr) arr.push(a); else acoesPorMeta.set(a.metaCPId, [a]);
  }

  // Progresso ponderado de uma meta com a situação de um período passado.
  const pctPassado = (acs: AcaoPainel[], k: PeriodKey): number => {
    if (k === 'total' || !acs.length) return 0;
    const i = PERIOD_INDEX[k];
    let num = 0, den = 0;
    for (const a of acs) {
      num += (sitPassada.get(a.id)?.[i] ?? 0) * a.peso;
      den += a.peso;
    }
    return den ? num / den : 0;
  };

  // O ranking (só do prefeito) usa todos os períodos; os demais perfis só
  // precisam do "vs. 30 dias atrás".
  const periodosUsados: PeriodKey[] = user.perfil === 'prefeito' ? PERIOD_KEYS : ['30d'];
  const pctMeta = new Map<string, number>();
  const pctMetaPassado = new Map<string, Partial<Record<PeriodKey, number>>>();
  let concluidas = 0;
  for (const m of metasCP) {
    const acs = acoesPorMeta.get(m.id) ?? [];
    const pct = pctFromAcoes(acs);
    pctMeta.set(m.id, pct);
    if (acs.length > 0 && pct >= 0.99) concluidas++;
    const passado: Partial<Record<PeriodKey, number>> = {};
    for (const k of periodosUsados) passado[k] = pctPassado(acs, k);
    pctMetaPassado.set(m.id, passado);
  }

  const totalMetas = metasCP.length;
  const acoesAtrasadas = visibleAcoes.filter(a => computeStatusAcao(a, hoje) === 'atraso');
  const emAtraso = acoesAtrasadas.length;

  // Ações em atraso: aqui só o total e as cobranças que o usuário recebeu; a
  // lista completa vem sob demanda quando ele abre o quadro.
  const metaCPPorId = new Map(metasCP.map(m => [m.id, m]));
  const atrasadasVisiveis = await classificarAtrasadas(user, acoesAtrasadas, metaCPPorId);
  const cobrancasRecebidas = (
    await detalharAtrasadas(user, atrasadasVisiveis.filter(c => c.recebiCobranca), nomes)
  ).filter(r => r.cobrancasContraMim.length > 0);

  // Próximos prazos: ações que ainda não venceram (as já vencidas aparecem em
  // AcoesAtrasadas), ordenadas pelo prazo mais próximo primeiro.
  const prazoRows: PrazoRow[] = visibleAcoes
    .filter(a => {
      const st = computeStatusAcao(a, hoje);
      return st !== 'atraso' && st !== 'concluida';
    })
    .map(a => {
      const prazo = calcPrazoFinal(a.inicio, a.tempoNecessario);
      if (!prazo) return null;
      const meta = metaCPPorId.get(a.metaCPId);
      const diasRestantes = Math.ceil((prazo.getTime() - now) / (24 * 60 * 60 * 1000));
      return {
        acaoId: a.id,
        acaoNome: a.nome,
        metaCPId: a.metaCPId,
        metaCPNome: meta?.nome ?? '—',
        secretariaNome: meta ? (nomes.secretariaNome.get(meta.secretariaDonaId) ?? '—') : '—',
        prazo,
        diasRestantes
      };
    })
    .filter((r): r is PrazoRow => r !== null)
    .sort((a, b) => a.prazo.getTime() - b.prazo.getTime())
    .slice(0, 8);

  let pctGeral = 0, pctGeral30d = 0;
  if (metasCP.length) {
    let sum = 0, sum30 = 0;
    for (const m of metasCP) {
      sum += pctMeta.get(m.id) ?? 0;
      sum30 += pctMetaPassado.get(m.id)?.['30d'] ?? 0;
    }
    pctGeral = sum / metasCP.length;
    pctGeral30d = sum30 / metasCP.length;
  }
  const deltaGeral = pctGeral - pctGeral30d;

  let secStats: SecStat[] = [];
  if (user.perfil === 'prefeito') {
    const metasPorSec = new Map<string, typeof metasCP>();
    for (const m of metasCP) {
      const arr = metasPorSec.get(m.secretariaDonaId);
      if (arr) arr.push(m); else metasPorSec.set(m.secretariaDonaId, [m]);
    }
    secStats = nomes.secretarias
      .map(s => {
        const mts = metasPorSec.get(s.id) ?? [];
        const media = (valor: (id: string) => number) =>
          mts.length ? mts.reduce((acc, m) => acc + valor(m.id), 0) / mts.length : 0;
        const pct = media(id => pctMeta.get(id) ?? 0);
        const deltas = {} as Record<PeriodKey, number>;
        for (const k of PERIOD_KEYS) deltas[k] = pct - media(id => pctMetaPassado.get(id)?.[k] ?? 0);
        return { id: s.id, nome: s.nome, metas: mts.length, pct, deltas };
      })
      .filter(x => x.metas > 0)
      .sort((a, b) => b.pct - a.pct);
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[26px] sm:text-[32px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Painel</h1>
        <p className="text-[15.5px] mt-1.5 m-0" style={{ color: 'var(--ink-3)', maxWidth: '62ch' }}>
          Visão consolidada do Plano de Metas 2025–2028.
        </p>
      </div>

      {propostasResolvidas.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {propostasResolvidas.map(p => (
            <Link
              key={p.id}
              href={`/propostas/${p.id}`}
              prefetch={false}
              className="block p-3 border-l-4"
              style={{
                background: p.status === 'aprovada' ? 'rgba(42,138,42,0.07)' : 'rgba(204,51,51,0.07)',
                borderColor: p.status === 'aprovada' ? 'var(--ok, #2a8a2a)' : 'var(--danger, #c33)'
              }}
            >
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                  <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: p.status === 'aprovada' ? 'var(--ok, #2a8a2a)' : 'var(--danger, #c33)' }}>
                    {p.status === 'aprovada' ? 'Proposta aprovada' : 'Proposta rejeitada'}
                  </span>
                  <div className="font-medium mt-0.5" style={{ color: 'var(--ink)' }}>
                    {p.titulo}
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    {p.status === 'aprovada'
                      ? `Aprovada por ${p.aprovador?.nome ?? '—'} em ${fmtDateTime(p.aprovadaEm)}`
                      : `Rejeitada por ${p.rejeitador?.nome ?? '—'} em ${fmtDateTime(p.rejeitadaEm)}`}
                    {p.aplicadaEm && ' · Alterações aplicadas'}
                    {p.aplicacaoErro && ' · Erro na aplicação'}
                  </div>
                </div>
                <span className="font-mono text-[11px] tracking-wider" style={{ color: 'var(--brass)' }}>Ver timeline →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-6 border" style={{ background: 'var(--rule)', borderColor: 'var(--rule)' }}>
        <Metric val={fmtPct(pctGeral)} label="Progresso geral" note="Média das metas de curto prazo" delta={deltaGeral} />
        <Metric val={String(totalMetas)} label="Metas ativas" note={`${concluidas} concluídas`} />
        <Metric val={String(emAtraso)} label="Ações em atraso" note="Requerem justificativa" />
        <Metric val={String(propostasPendentes.length)} label="Propostas p/ você" note="Aguardando sua análise" />
      </div>

      <AcoesAtrasadas total={atrasadasVisiveis.length} rowsComCobranca={cobrancasRecebidas} />

      <div className="mb-4">
        <ProximosPrazos rows={prazoRows} />
      </div>

      {user.perfil === 'prefeito' && (
        <div className="mb-4">
          <RankingSecretarias secStats={secStats} />
        </div>
      )}

      <div style={{ maxWidth: 720 }}>
        <div className="panel">
          <div className="flex flex-wrap justify-between items-baseline gap-2 pb-3 mb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
            <div className="font-display text-[18px] font-semibold">Propostas na sua caixa</div>
            <Link href="/propostas" className="font-mono text-[12px] tracking-wider uppercase" style={{ color: 'var(--brass)' }}>Abrir caixa →</Link>
          </div>
          {propostasPendentes.length === 0 ? (
            <div className="text-center py-6 text-[15px]" style={{ color: 'var(--ink-3)' }}>
              Nada esperando por você agora.
            </div>
          ) : (
            propostasPendentes.slice(0, 5).map(p => (
              <div key={p.id} className="py-3 border-b" style={{ borderColor: 'var(--rule)' }}>
                <div className="flex justify-between gap-3">
                  <div className="font-medium text-[15.5px]">{p.titulo}</div>
                  <span className={`pill ${p.proximoRevisor === 'chefe' ? 'pill-warn' : 'pill-brass'}`}>{p.proximoRevisor}</span>
                </div>
                <div className="text-[13px] mt-1" style={{ color: 'var(--ink-3)' }}>
                  {p.autor.nome} · {fmtDateTime(p.criadoEm)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Metric({ val, label, note, delta }: { val: string; label: string; note?: string; delta?: number }) {
  return (
    <div className="p-4 sm:p-5 min-w-0" style={{ background: 'var(--panel)' }}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <div className="font-display text-[28px] sm:text-[36px] leading-none tabular-nums" style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}>{val}</div>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <div className="font-mono text-[11px] sm:text-[12px] tracking-wider sm:tracking-widest uppercase mt-2" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {note && <div className="text-[13px] sm:text-[14px] mt-1" style={{ color: 'var(--ink-2)' }}>{note}</div>}
      {delta !== undefined && <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>vs. 30 dias atrás</div>}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const pct = Math.round(delta * 100);
  if (Math.abs(pct) < 1) {
    return <span className="font-mono text-[13.5px] tabular-nums" style={{ color: 'var(--ink-3)' }}>±0%</span>;
  }
  const positivo = pct > 0;
  return (
    <span
      className="font-mono text-[13.5px] tabular-nums font-semibold"
      style={{ color: positivo ? 'var(--ok, #2a8a2a)' : 'var(--danger, #c33)' }}
      title={`Variação de progresso em relação a 30 dias atrás`}
    >
      {positivo ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

async function loadPropostasPendentes(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return [];
  const secIds = user.lotacoes.map(l => l.secretariaId);
  const divIds = user.lotacoes.map(l => l.divisaoId).filter(Boolean) as string[];

  if (user.perfil === 'prefeito') {
    return prisma.proposta.findMany({
      where: { status: 'pendente', proximoRevisor: 'prefeito' },
      include: { autor: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' }
    });
  }
  if (user.perfil === 'secretario') {
    return prisma.proposta.findMany({
      where: { status: 'pendente', proximoRevisor: 'secretario', secretariaDonaId: { in: secIds } },
      include: { autor: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' }
    });
  }
  if (user.perfil === 'chefe') {
    return prisma.proposta.findMany({
      where: { status: 'pendente', proximoRevisor: 'chefe', divisaoOrigemId: { in: divIds } },
      include: { autor: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' }
    });
  }
  return [];
}

type PropostaResolvida = {
  id: string;
  titulo: string;
  status: string;
  aprovadaEm: Date | null;
  aprovadaPor: string | null;
  rejeitadaEm: Date | null;
  rejeitadaPor: string | null;
  aplicadaEm: Date | null;
  aplicacaoErro: string | null;
  aprovador: { nome: string } | null;
  rejeitador: { nome: string } | null;
};

async function loadPropostasResolvidasDoAutor(user: Awaited<ReturnType<typeof getCurrentUser>>): Promise<PropostaResolvida[]> {
  if (!user) return [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const propostas = await prisma.proposta.findMany({
    where: {
      autorId: user.id,
      status: { in: ['aprovada', 'rejeitada'] },
      OR: [
        { aprovadaEm: { gte: cutoff } },
        { rejeitadaEm: { gte: cutoff } }
      ]
    },
    orderBy: { criadoEm: 'desc' },
    take: 5
  });

  const userIds = Array.from(new Set(
    propostas.map(p => p.aprovadaPor ?? p.rejeitadaPor).filter(Boolean) as string[]
  ));
  const users = userIds.length
    ? await prisma.usuario.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  return propostas.map(p => ({
    ...p,
    aprovador: p.aprovadaPor ? userMap.get(p.aprovadaPor) ?? null : null,
    rejeitador: p.rejeitadaPor ? userMap.get(p.rejeitadaPor) ?? null : null
  }));
}
