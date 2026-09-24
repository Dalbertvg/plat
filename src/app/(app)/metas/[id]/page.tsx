import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, filterVisibleMetas } from '@/lib/rbac';
import { updateAcao } from '@/actions/acoes';
import { fmtDate, fmtDateTime, fmtPct, pctFromAcoes, fmtAlvo, labelDeTempo, computeStatusAcao, calcPrazoMetaFinal, fmtMesAno } from '@/lib/format';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MetaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const { id } = await params;
  const m = await prisma.metaCP.findUnique({
    where: { id },
    include: {
      metaLP: true,
      secretariaDona: true,
      divisaoExecutora: true,
      acoes: { include: { responsavel: true } },
      participantes: { include: { secretaria: true } }
    }
  });
  if (!m) notFound();

  const visible = filterVisibleMetas(user, [m], m.participantes);
  if (visible.length === 0) notFound();

  const pct = pctFromAcoes(m.acoes);
  const prazoMeta = calcPrazoMetaFinal(m.acoes);
  const canEdit = !m.arquivada && can(user, 'meta.edit', { secretariaDonaId: m.secretariaDonaId });
  const canPropose = !m.arquivada && can(user, 'proposta.submit');
  const target = {
    secretariaDonaId: m.secretariaDonaId,
    divisaoExecutoraId: m.divisaoExecutoraId
  };

  const arquivadaPor = m.arquivadaPor
    ? await prisma.usuario.findUnique({ where: { id: m.arquivadaPor }, select: { nome: true } })
    : null;

  return (
    <>
      <Link href="/metas" className="btn btn-ghost btn-sm mb-2">← Voltar para lista</Link>

      {m.arquivada && (
        <div className="rbac-note" style={{ borderLeftColor: 'var(--ink-3)' }}>
          <b style={{ color: 'var(--ink-3)' }}>Meta arquivada</b>
          {arquivadaPor && <> por <b style={{ color: 'var(--ink)' }}>{arquivadaPor.nome}</b></>}
          {m.arquivadaEm && <> em {fmtDateTime(m.arquivadaEm)}</>}
          {m.arquivadaJustificativa && <> — &ldquo;{m.arquivadaJustificativa}&rdquo;</>}
        </div>
      )}

      <div className="panel mb-4">
        <div className="flex justify-between items-start gap-5 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h1 className="font-display text-[22px] leading-tight m-0" style={{ letterSpacing: '-0.01em', maxWidth: '60ch' }}>{m.nome}</h1>
              <span className={`pill ${m.tipo === 'principal' ? 'pill-nav' : 'pill-neutral'}`}>
                {m.tipo === 'principal' ? 'Plano de governo' : 'Secundária'}
              </span>
              {m.arquivada && <span className="pill pill-neutral">arquivada</span>}
            </div>
            <div className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              <code>{m.id}</code> · Capítulo {m.metaLP.capitulo} · {m.metaLP.titulo}
            </div>
          </div>
          <div className="flex gap-2">
            {!canEdit && canPropose && <Link href={`/propostas/nova?metaId=${m.id}`} className="btn btn-sm">Propor edição</Link>}
            {canEdit && <Link href={`/metas/${m.id}/editar`} className="btn btn-primary btn-sm">✎ Editar meta</Link>}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-5 pt-3.5 border-t" style={{ borderColor: 'var(--rule)' }}>
          <Fact label="Progresso" value={fmtPct(pct)} />
          <Fact label="Ações" value={String(m.acoes.length)} />
          <Fact label="Prazo da meta" value={prazoMeta ? fmtMesAno(prazoMeta) : '—'} sub />
          <Fact label="Secretaria dona" value={m.secretariaDona.nome} sub />
          <Fact label="Divisão executora" value={m.divisaoExecutora.nome} sub />
        </div>

        {m.participantes.length > 0 && (
          <div className="mt-3 pt-3 border-t text-[12.5px]" style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)' }}>
            <span className="font-mono text-[10px] tracking-widest uppercase mr-2" style={{ color: 'var(--ink-3)' }}>Participantes</span>
            {m.participantes.map(p => (
              <span key={p.secretariaId} className="pill pill-brass mr-1.5">{p.secretaria.nome}</span>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
          <div className="font-display text-[15px] font-semibold">Ações</div>
          {canEdit && <Link href={`/metas/${m.id}/editar`} className="btn btn-sm">Gerenciar ações</Link>}
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Ação</th>
              <th>Início</th>
              <th>Tempo</th>
              <th style={{ textAlign: 'right' }}>Alvo</th>
              <th style={{ textAlign: 'right' }}>Sit.</th>
              <th>Status</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {m.acoes.map(a => {
              const derivedStatus = computeStatusAcao(a);
              const statusLabel =
                derivedStatus === 'concluida' ? 'CONCLUÍDA' :
                derivedStatus === 'atraso' ? 'ATRASO' :
                derivedStatus === 'nao_iniciada' ? 'NÃO INICIADA' : 'ANDAMENTO';
              const statusPill =
                derivedStatus === 'concluida' ? 'pill-ok' :
                derivedStatus === 'atraso' ? 'pill-late' :
                derivedStatus === 'nao_iniciada' ? 'pill-brass' : 'pill-warn';
              const canUpdateFull = can(user, 'acao.edit', target);
              const canUpdateSit = can(user, 'acao.updateSituacao', { ...target, responsavelId: a.responsavelId });
              const canDoAnything = !m.arquivada && (canUpdateFull || canUpdateSit);
              return (
                <ActionRow
                  key={a.id}
                  a={a}
                  statusLabel={statusLabel}
                  statusPill={statusPill}
                  canDoAnything={canDoAnything}
                />
              );
            })}
            {m.acoes.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--ink-3)' }}>
                {canEdit
                  ? <>Nenhuma ação registrada. <Link href={`/metas/${m.id}/editar`} style={{ color: 'var(--brass)' }}>Adicionar a primeira →</Link></>
                  : 'Nenhuma ação registrada.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

type AcaoRow = {
  id: string;
  nome: string;
  peso: number;
  tempoNecessario: string | null;
  alvo: number;
  unidade: string | null;
  situacaoAtual: number;
  status: string;
  inicio: string | null;
  prazo: string | null;
  responsavel: { nome: string } | null;
  ultJustificativa: string | null;
  ultJustQuando: Date | null;
};

function ActionRow({ a, statusLabel, statusPill, canDoAnything }: {
  a: AcaoRow;
  statusLabel: string;
  statusPill: string;
  canDoAnything: boolean;
}) {
  return (
    <>
      <tr>
        <td className="font-medium">
          {a.nome}
          {a.ultJustificativa && (
            <div className="text-[11px] mt-0.5 italic" style={{ color: 'var(--ink-3)' }} title={fmtDateTime(a.ultJustQuando)}>
              Última justificativa: {a.ultJustificativa}
            </div>
          )}
        </td>
        <td>{fmtDate(a.inicio)}</td>
        <td className="text-[12px]">{labelDeTempo(a.tempoNecessario)}</td>
        <td style={{ textAlign: 'right' }}><code>{fmtAlvo(a.alvo, a.unidade)}</code></td>
        <td style={{ textAlign: 'right' }}><code>{fmtPct(a.situacaoAtual)}</code></td>
        <td><span className={`pill ${statusPill}`}>{statusLabel}</span></td>
        <td className="text-[12px]">{a.responsavel?.nome ?? '—'}</td>
      </tr>
      {canDoAnything && (
        <tr>
          <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--rule)' }}>
            <details>
              <summary className="cursor-pointer px-3 py-1.5 list-none text-[11.5px]" style={{ color: 'var(--brass)', background: 'var(--paper-3)' }}>
                Atualizar progresso ▾
              </summary>
              <form action={updateAcao} className="p-3 grid grid-cols-[100px_1fr_auto] gap-3 items-end" style={{ background: 'var(--panel)' }}>
                <input type="hidden" name="acaoId" value={a.id} />
                <div className="field m-0">
                  <label className="field-lbl">Situação (%)</label>
                  <input name="situacaoAtual" type="number" step="0.1" min={0} max={100} className="input" required defaultValue={round1(a.situacaoAtual * 100)} />
                </div>
                <div className="field m-0">
                  <label className="field-lbl">Justificativa <span style={{ color: 'var(--danger, #c33)' }}>*</span></label>
                  <input name="justificativa" className="input" required minLength={3} placeholder="Por que o valor mudou? (obrigatório)" />
                </div>
                <button type="submit" className="btn btn-primary btn-sm">Salvar</button>
              </form>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

// Evita ruído de ponto flutuante ao converter 0–1 para 0–100 (ex.: 44.99999999).
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {sub
        ? <div className="text-[13.5px] font-medium">{value}</div>
        : <div className="font-display text-[20px] font-medium tabular-nums" style={{ color: 'var(--navy)' }}>{value}</div>
      }
    </div>
  );
}
