import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { filterVisibleMetas } from '@/lib/rbac';
import { fmtPct, fmtDateTime, pctFromAcoes, computeStatusAcao, calcPrazoFinal } from '@/lib/format';
import Link from 'next/link';
import { RankingSecretarias, type PeriodKey, type SecStat } from './RankingSecretarias';
import { AcoesAtrasadas, type AcaoAtrasadaRow } from './AcoesAtrasadas';
import { ProximosPrazos, type PrazoRow } from './ProximosPrazos';

export const dynamic = 'force-dynamic';

const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '180d': 180,
  '360d': 360,
  'total': null // desde o início: usa corte = epoch para forçar situação passada = 0
};

// Reconstitui a "situação em <corte>" de cada ação a partir do último snapshot
// cujo `quando` <= corte. Ações sem snapshot anterior contam como 0 (baseline
// conservador). Para o período "completo" o corte é epoch, então tudo dá 0.
function buildSitEmCorte(
  snapshots: Array<{ acaoId: string; situacaoAtual: number; quando: Date }>,
  corte: Date
): Map<string, number> {
  const m = new Map<string, number>();
  // snapshots já vem ordenado por quando DESC
  for (const s of snapshots) {
    if (s.quando > corte) continue;
    if (!m.has(s.acaoId)) m.set(s.acaoId, s.situacaoAtual);
  }
  return m;
}

// Dias em atraso derivados de (inicio + máx do tempoNecessario). Positivo quando
// o prazo já venceu; null quando não dá pra calcular (falta inicio ou tempo).
function diasEmAtrasoDerivado(inicio: string | null, tempo: string | null): number | null {
  const prazo = calcPrazoFinal(inicio, tempo);
  if (!prazo) return null;
  const diff = Date.now() - prazo.getTime();
  if (diff <= 0) return null;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

async function buildAtrasoRows(
  acoesAtrasadas: Array<{
    id: string; nome: string; metaCPId: string; situacaoAtual: number;
    prazo: string | null; inicio: string | null; tempoNecessario: string | null;
    responsavelId: string | null;
    ultJustificativa: string | null; ultJustQuando: Date | null;
  }>,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
): Promise<AcaoAtrasadaRow[]> {
  if (acoesAtrasadas.length === 0) return [];

  const acaoIds = acoesAtrasadas.map(a => a.id);
  const metaIds = Array.from(new Set(acoesAtrasadas.map(a => a.metaCPId)));

  // Carrega TODAS as cobranças/comentários destas ações (não só as minhas). A
  // visibilidade por linha é decidida no map abaixo, respeitando a hierarquia.
  const [metas, todasCobrancas, todasRespostas, todosComentarios] = await Promise.all([
    prisma.metaCP.findMany({
      where: { id: { in: metaIds } },
      include: {
        secretariaDona: true,
        divisaoExecutora: true
      }
    }),
    prisma.auditoria.findMany({
      where: {
        entidade: 'acao',
        entidadeId: { in: acaoIds },
        tag: 'ACAO:COBRANCA'
      },
      orderBy: { quando: 'desc' }
    }),
    prisma.auditoria.findMany({
      where: {
        entidade: 'acao',
        entidadeId: { in: acaoIds },
        tag: 'ACAO:RESPOSTA_COBRANCA'
      }
    }),
    prisma.auditoria.findMany({
      where: {
        entidade: 'acao',
        entidadeId: { in: acaoIds },
        tag: 'ACAO:COMENTARIO'
      },
      orderBy: { quando: 'desc' }
    })
  ]);

  const responsavelIds = Array.from(
    new Set(acoesAtrasadas.map(a => a.responsavelId).filter(Boolean) as string[])
  );
  const responsaveis = responsavelIds.length
    ? await prisma.usuario.findMany({ where: { id: { in: responsavelIds } } })
    : [];
  const respMap = new Map(responsaveis.map(r => [r.id, r]));
  const metaMap = new Map(metas.map(m => [m.id, m]));

  // Mapa: cobrançaId → resposta
  const respostaPorCobranca = new Map<string, typeof todasRespostas[number]>();
  for (const r of todasRespostas) {
    if (r.parentId) respostaPorCobranca.set(r.parentId, r);
  }

  // Agrupa cobranças e comentários por ação
  const cobrancasPorAcao = new Map<string, typeof todasCobrancas>();
  for (const c of todasCobrancas) {
    const arr = cobrancasPorAcao.get(c.entidadeId) ?? [];
    arr.push(c);
    cobrancasPorAcao.set(c.entidadeId, arr);
  }
  const comentariosPorAcao = new Map<string, typeof todosComentarios>();
  for (const c of todosComentarios) {
    const arr = comentariosPorAcao.get(c.entidadeId) ?? [];
    arr.push(c);
    comentariosPorAcao.set(c.entidadeId, arr);
  }

  const rows: AcaoAtrasadaRow[] = acoesAtrasadas.map(a => {
    const meta = metaMap.get(a.metaCPId);
    const resp = a.responsavelId ? respMap.get(a.responsavelId) : null;
    const respPerfil = resp?.perfil ?? null;
    const secretariaDonaId = meta?.secretariaDonaId;
    const divisaoExecutoraId = meta?.divisaoExecutoraId;
    const souResponsavel = a.responsavelId === user.id;

    // Escopo de VISIBILIDADE: quem pode ver essa ação no painel além do
    // responsável — inclui o chefe da divisão, que acompanha mas não cobra.
    const escopoVisibilidade =
      user.perfil === 'prefeito' ||
      (user.perfil === 'secretario' && !!secretariaDonaId &&
        user.lotacoes.some(l => l.secretariaId === secretariaDonaId)) ||
      (user.perfil === 'chefe' && !!divisaoExecutoraId &&
        user.lotacoes.some(l => l.divisaoId === divisaoExecutoraId));

    // Escopo de COBRANÇA: só prefeito e o secretário dono. Chefe é a base da
    // hierarquia — não tem subordinado pra cobrar, só responde quando é o
    // próprio cobrado (anexa mensagem via responderCobranca).
    const podeCobrarHierarquia =
      user.perfil === 'prefeito' ||
      (user.perfil === 'secretario' && !!secretariaDonaId &&
        user.lotacoes.some(l => l.secretariaId === secretariaDonaId));
    const podeCobrar = podeCobrarHierarquia && !souResponsavel;

    // Cadeia de notificação de cobranças: quem é notificado quando um superior cobra.
    // - Responsável direto sempre recebe.
    // - Se responsável é chefe → secretário da secretaria também.
    // - Se responsável é secretário → só ele.
    const ehSecretariaDona = user.perfil === 'secretario' && !!secretariaDonaId &&
      user.lotacoes.some(l => l.secretariaId === secretariaDonaId);

    const recebiCobranca = souResponsavel ||
      (ehSecretariaDona && respPerfil === 'chefe');

    const cobrancasDessa = cobrancasPorAcao.get(a.id) ?? [];

    const minhaUltima = cobrancasDessa.find(c => c.atorId === user.id);
    const mapCobrancaInfo = (c: typeof todasCobrancas[number]) => {
      const resp = respostaPorCobranca.get(c.id);
      return {
        id: c.id,
        atorId: c.atorId,
        atorNome: c.atorNome,
        atorPerfil: c.perfil,
        quando: c.quando.toISOString(),
        msg: extractMsgExtra(c.msg),
        resposta: resp
          ? { atorNome: resp.atorNome, quando: resp.quando.toISOString(), msg: resp.msg }
          : null
      };
    };

    // cobrancasContraMim: cobranças visíveis para quem está na cadeia de notificação
    // (responsável direto OU superior hierárquico), excluindo cobranças feitas pelo próprio.
    const cobrancasContraMim = recebiCobranca
      ? cobrancasDessa.filter(c => c.atorId !== user.id).map(mapCobrancaInfo)
      : [];
    const cobrancasGerenciais = escopoVisibilidade && !recebiCobranca
      ? cobrancasDessa.filter(c => c.atorId !== user.id).map(mapCobrancaInfo)
      : [];

    // Comentário livre: o canal do chefe (e de qualquer um no escopo) pra
    // anexar uma mensagem sem que isso seja uma cobrança.
    const podeComentar = escopoVisibilidade || souResponsavel;
    const comentarios = (podeComentar ? comentariosPorAcao.get(a.id) ?? [] : [])
      .map(c => ({
        atorNome: c.atorNome,
        atorPerfil: c.perfil,
        quando: c.quando.toISOString(),
        msg: c.msg
      }));

    return {
      id: a.id,
      nome: a.nome,
      metaCPId: a.metaCPId,
      metaCPNome: meta?.nome ?? '—',
      secretariaNome: meta?.secretariaDona.nome ?? '—',
      divisaoNome: meta?.divisaoExecutora.nome ?? '—',
      responsavelNome: resp?.nome ?? null,
      responsavelPerfil: resp?.perfil ?? null,
      responsavelId: a.responsavelId,
      prazo: a.prazo,
      diasEmAtraso: diasEmAtrasoDerivado(a.inicio, a.tempoNecessario),
      situacaoAtual: a.situacaoAtual,
      ultimaJustificativa: a.ultJustificativa,
      ultJustQuando: a.ultJustQuando ? a.ultJustQuando.toISOString() : null,
      podeCobrar,
      podeComentar,
      comentarios,
      minhaUltimaEm: minhaUltima ? minhaUltima.quando.toISOString() : null,
      cobrancasContraMim,
      cobrancasGerenciais,
      souResponsavel,
      recebiCobranca,
      escopoVisibilidade
    };
  });

  // Só mostra ações que o usuário tem escopo pra ver:
  // - prefeito, secretário dono ou chefe da divisão: escopoVisibilidade = true
  // - responsável ou na cadeia de notificação: recebiCobranca = true
  // (podeCobrar é mais estrito que escopoVisibilidade — chefe vê mas não cobra)
  const rowsVisiveis = rows.filter(r => r.escopoVisibilidade || r.recebiCobranca);

  // Mais atrasados primeiro; ações sem prazo por último.
  rowsVisiveis.sort((x, y) => {
    const dx = x.diasEmAtraso ?? -1;
    const dy = y.diasEmAtraso ?? -1;
    return dy - dx;
  });

  return rowsVisiveis;
}

// Extrai só o trecho depois de " — " da msg de auditoria (que é a msg opcional do ator).
function extractMsgExtra(msg: string): string {
  const idx = msg.indexOf(' — ');
  return idx > 0 ? msg.slice(idx + 3).trim() : '';
}

export default async function PainelPage() {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const [secretarias, allMetasCP, acoes, propostasPendentes, propostasResolvidas, participantes] = await Promise.all([
    prisma.secretaria.findMany(),
    prisma.metaCP.findMany({ where: { arquivada: false } }),
    prisma.acao.findMany(),
    loadPropostasPendentes(user),
    loadPropostasResolvidasDoAutor(user),
    prisma.metaCPParticipante.findMany()
  ]);

  const metasCP = filterVisibleMetas(user, allMetasCP, participantes);
  const visibleMetaIds = new Set(metasCP.map(m => m.id));
  const visibleAcoes = acoes.filter(a => visibleMetaIds.has(a.metaCPId));

  const acaoIds = visibleAcoes.map(a => a.id);

  // Carrega TODOS os snapshots uma vez e reconstrói a situação passada em memória
  // para cada janela; evita 6 queries e mantém a página rápida.
  const snapshots = acaoIds.length
    ? await prisma.acaoSnapshot.findMany({
        where: { acaoId: { in: acaoIds } },
        orderBy: { quando: 'desc' },
        select: { acaoId: true, situacaoAtual: true, quando: true }
      })
    : [];

  const now = Date.now();
  const periodKeys: PeriodKey[] = ['30d', '60d', '90d', '180d', '360d', 'total'];

  // Para cada janela, monta um "acoesPast" (situação passada aplicada) e um
  // pctPorMeta pré-calculado, para não recalcular por secretaria depois.
  const pastByPeriod: Record<PeriodKey, Array<typeof visibleAcoes[number]>> = {} as Record<PeriodKey, Array<typeof visibleAcoes[number]>>;
  for (const k of periodKeys) {
    const dias = PERIOD_DAYS[k];
    const corte = dias == null ? new Date(0) : new Date(now - dias * 24 * 60 * 60 * 1000);
    const sit = buildSitEmCorte(snapshots, corte);
    pastByPeriod[k] = visibleAcoes.map(a => ({ ...a, situacaoAtual: sit.get(a.id) ?? 0 }));
  }

  const visibleSecIds = new Set(metasCP.map(m => m.secretariaDonaId));

  const totalMetas = metasCP.length;
  const concluidas = metasCP.filter(m => {
    const acs = visibleAcoes.filter(a => a.metaCPId === m.id);
    return acs.length > 0 && pctFromAcoes(acs) >= 0.99;
  }).length;
  const acoesAtrasadas = visibleAcoes.filter(a => computeStatusAcao(a) === 'atraso');
  const emAtraso = acoesAtrasadas.length;

  const atrasoRows = await buildAtrasoRows(acoesAtrasadas, user);

  // Próximos prazos: ações que ainda não venceram (as já vencidas aparecem em
  // AcoesAtrasadas), ordenadas pelo prazo mais próximo primeiro.
  const secretariaNomePorId = new Map(secretarias.map(s => [s.id, s.nome]));
  const metaCPPorId = new Map(metasCP.map(m => [m.id, m]));
  const prazoRows: PrazoRow[] = visibleAcoes
    .filter(a => computeStatusAcao(a) !== 'atraso' && computeStatusAcao(a) !== 'concluida')
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
        secretariaNome: meta ? (secretariaNomePorId.get(meta.secretariaDonaId) ?? '—') : '—',
        prazo,
        diasRestantes
      };
    })
    .filter((r): r is PrazoRow => r !== null)
    .sort((a, b) => a.prazo.getTime() - b.prazo.getTime())
    .slice(0, 8);

  let pctGeral = 0, pctGeral30d = 0;
  if (metasCP.length) {
    const sum = metasCP.reduce((s, m) => s + pctFromAcoes(visibleAcoes.filter(a => a.metaCPId === m.id)), 0);
    const past30 = pastByPeriod['30d'];
    const sum30 = metasCP.reduce((s, m) => s + pctFromAcoes(past30.filter(a => a.metaCPId === m.id)), 0);
    pctGeral = sum / metasCP.length;
    pctGeral30d = sum30 / metasCP.length;
  }
  const deltaGeral = pctGeral - pctGeral30d;

  const secStats: SecStat[] = secretarias
    .filter(s => visibleSecIds.has(s.id))
    .map(s => {
      const mts = metasCP.filter(m => m.secretariaDonaId === s.id);
      const pctSum = mts.reduce((sum, m) => sum + pctFromAcoes(visibleAcoes.filter(a => a.metaCPId === m.id)), 0);
      const pct = mts.length ? pctSum / mts.length : 0;

      const deltas: Record<PeriodKey, number> = {} as Record<PeriodKey, number>;
      for (const k of periodKeys) {
        const past = pastByPeriod[k];
        const sumPast = mts.reduce((sum, m) => sum + pctFromAcoes(past.filter(a => a.metaCPId === m.id)), 0);
        const pctPast = mts.length ? sumPast / mts.length : 0;
        deltas[k] = pct - pctPast;
      }

      return { id: s.id, nome: s.nome, metas: mts.length, pct, deltas };
    })
    .filter(x => x.metas > 0)
    .sort((a, b) => b.pct - a.pct);

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[32px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Painel</h1>
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
              className="block p-3 border-l-4"
              style={{
                background: p.status === 'aprovada' ? 'rgba(42,138,42,0.07)' : 'rgba(204,51,51,0.07)',
                borderColor: p.status === 'aprovada' ? 'var(--ok, #2a8a2a)' : 'var(--danger, #c33)'
              }}
            >
              <div className="flex justify-between items-center gap-3">
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

      <div className="grid grid-cols-4 gap-px mb-6 border" style={{ background: 'var(--rule)', borderColor: 'var(--rule)' }}>
        <Metric val={fmtPct(pctGeral)} label="Progresso geral" note="Média das metas de curto prazo" delta={deltaGeral} />
        <Metric val={String(totalMetas)} label="Metas ativas" note={`${concluidas} concluídas`} />
        <Metric val={String(emAtraso)} label="Ações em atraso" note="Requerem justificativa" />
        <Metric val={String(propostasPendentes.length)} label="Propostas p/ você" note="Aguardando sua análise" />
      </div>

      <AcoesAtrasadas rows={atrasoRows} />

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
          <div className="flex justify-between items-baseline pb-3 mb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
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
    <div className="p-5" style={{ background: 'var(--panel)' }}>
      <div className="flex items-baseline gap-2">
        <div className="font-display text-[36px] leading-none tabular-nums" style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}>{val}</div>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <div className="font-mono text-[12px] tracking-widest uppercase mt-2" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {note && <div className="text-[14px] mt-1" style={{ color: 'var(--ink-2)' }}>{note}</div>}
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
      include: { autor: true },
      orderBy: { criadoEm: 'desc' }
    });
  }
  if (user.perfil === 'secretario') {
    return prisma.proposta.findMany({
      where: { status: 'pendente', proximoRevisor: 'secretario', secretariaDonaId: { in: secIds } },
      include: { autor: true },
      orderBy: { criadoEm: 'desc' }
    });
  }
  if (user.perfil === 'chefe') {
    return prisma.proposta.findMany({
      where: { status: 'pendente', proximoRevisor: 'chefe', divisaoOrigemId: { in: divIds } },
      include: { autor: true },
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
    ? await prisma.usuario.findMany({ where: { id: { in: userIds } } })
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  return propostas.map(p => ({
    ...p,
    aprovador: p.aprovadaPor ? userMap.get(p.aprovadaPor) ?? null : null,
    rejeitador: p.rejeitadaPor ? userMap.get(p.rejeitadaPor) ?? null : null
  }));
}
