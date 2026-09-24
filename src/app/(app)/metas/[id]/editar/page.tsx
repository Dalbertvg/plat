import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { atualizarMetaCP, arquivarMetaCP, criarAcao, atualizarAcaoDados, deletarAcao } from '@/actions/metas';
import { fmtPct, fmtAlvo, TEMPO_OPCOES, labelDeTempo, calcPrazoFinal, computeStatusAcao, fmtMesAno } from '@/lib/format';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { UnidadeInput } from './UnidadeInput';
import { MesAnoPicker } from './MesAnoPicker';

export const dynamic = 'force-dynamic';

export default async function EditarMetaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const { id } = await params;
  const m = await prisma.metaCP.findUnique({
    where: { id },
    include: {
      metaLP: true,
      secretariaDona: true,
      divisaoExecutora: true,
      acoes: { include: { responsavel: true }, orderBy: { id: 'asc' } },
      participantes: true
    }
  });
  if (!m) notFound();

  if (!can(user, 'meta.edit', { secretariaDonaId: m.secretariaDonaId })) {
    redirect(`/metas/${m.id}`);
  }
  // Meta arquivada não é mais editável — só a tela de detalhe (com o aviso).
  if (m.arquivada) {
    redirect(`/metas/${m.id}`);
  }

  const [secretarias, divisoes, responsaveisCandidatos] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.divisao.findMany({ orderBy: { nome: 'asc' } }),
    prisma.usuario.findMany({
      where: {
        OR: [
          { lotacoes: { some: { divisaoId: m.divisaoExecutoraId } } },
          { perfil: 'secretario', lotacoes: { some: { secretariaId: m.secretariaDonaId } } }
        ]
      },
      orderBy: { nome: 'asc' }
    })
  ]);

  // Divisões que podem executar: pertencem à secretaria dona.
  const divisoesElegiveis = divisoes.filter(d => d.secretariaId === m.secretariaDonaId);

  const participantesIds = new Set(m.participantes.map(p => p.secretariaId));
  const canDelete = user.perfil === 'prefeito';

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <Link href={`/metas/${m.id}`} className="btn btn-ghost btn-sm">← Voltar para a meta</Link>
        <Link href="/metas" className="btn btn-ghost btn-sm">Ir para lista de metas</Link>
      </div>

      <div className="panel mb-4" style={{ maxWidth: 820 }}>
        <div className="flex justify-between items-start gap-4 pb-3 mb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
          <div>
            <h1 className="font-display text-[22px] leading-tight m-0 mb-1" style={{ letterSpacing: '-0.01em' }}>Editar meta</h1>
            <div className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              <code>{m.id}</code> · Capítulo {m.metaLP.capitulo} · {m.metaLP.titulo}
            </div>
          </div>
          <div className="text-right text-[12px]" style={{ color: 'var(--ink-3)' }}>
            <div>Dona: <b style={{ color: 'var(--ink-2)' }}>{m.secretariaDona.nome}</b></div>
            <div className="mt-0.5">(a secretaria dona não pode ser alterada aqui)</div>
          </div>
        </div>

        <form action={atualizarMetaCP}>
          <input type="hidden" name="metaCPId" value={m.id} />

          <div className="field">
            <label className="field-lbl">Nome</label>
            <input name="nome" className="input" required minLength={3} defaultValue={m.nome} />
          </div>

          {user.perfil === 'prefeito' && (
            <div className="field">
              <label className="field-lbl">Tipo da meta</label>
              <select name="tipo" className="select" defaultValue={m.tipo}>
                <option value="principal">Principal · compromisso do plano de governo</option>
                <option value="secundaria">Secundária · surgida depois, complementar</option>
              </select>
            </div>
          )}

          <div className="field">
            <label className="field-lbl">Divisão executora</label>
            <select name="divisaoExecutoraId" className="select" required defaultValue={m.divisaoExecutoraId}>
              {divisoesElegiveis.map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-lbl">Secretarias participantes</label>
            <div className="grid grid-cols-2 gap-1.5" style={{ padding: 8, background: 'var(--paper-3)', borderRadius: 3, border: '1px solid var(--rule)', maxHeight: 220, overflowY: 'auto' }}>
              {secretarias.filter(s => s.id !== m.secretariaDonaId).map(s => (
                <label key={s.id} className="flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                  <input type="checkbox" name="participantes" value={s.id} defaultChecked={participantesIds.has(s.id)} />
                  {s.nome}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end items-center gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--rule)' }}>
            <Link href={`/metas/${m.id}`} className="btn btn-ghost">Cancelar</Link>
            <button type="submit" className="btn btn-primary">Salvar alterações</button>
          </div>
        </form>

        {canDelete && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--rule)' }}>
            <details className="relative">
              <summary className="btn btn-danger btn-sm list-none cursor-pointer inline-block">Arquivar meta…</summary>
              <form action={arquivarMetaCP} className="absolute left-0 top-full mt-1 z-10 p-3 w-80" style={{ background: 'var(--panel)', border: '1px solid var(--rule-strong)', borderRadius: 3 }}>
                <input type="hidden" name="metaCPId" value={m.id} />
                <div className="text-[12.5px] mb-2" style={{ color: 'var(--ink-2)' }}>
                  A meta sai da lista ativa, mas o histórico (ações, propostas, auditoria) é preservado. Não apaga nada.
                </div>
                <div className="field mb-2">
                  <label className="field-lbl">Justificativa (obrigatória)</label>
                  <textarea
                    name="justificativa"
                    className="textarea"
                    required
                    minLength={10}
                    placeholder="Por que esta meta está sendo arquivada?"
                    style={{ minHeight: 60, fontSize: 12.5 }}
                  />
                </div>
                <button className="btn btn-danger btn-sm w-full" type="submit">Confirmar arquivamento</button>
              </form>
            </details>
          </div>
        )}
      </div>

      <div className="panel" style={{ maxWidth: 820 }}>
        <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
          <div className="font-display text-[15px] font-semibold">Ações ({m.acoes.length})</div>
        </div>

        {m.acoes.map(a => (
          <details key={a.id} className="mb-2 border" style={{ borderColor: 'var(--rule)' }}>
            <summary className="cursor-pointer p-2.5 flex justify-between items-center gap-3 list-none" style={{ background: 'var(--paper-3)' }}>
              <div className="flex-1">
                <div className="font-medium text-[13px]">{a.nome}</div>
                <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  Alvo <code>{fmtAlvo(a.alvo, a.unidade)}</code> · Sit. <code>{fmtPct(a.situacaoAtual)}</code> · Tempo: {labelDeTempo(a.tempoNecessario)} · {a.responsavel?.nome ?? 'sem responsável'}
                </div>
              </div>
              <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--brass)' }}>editar ▾</span>
            </summary>
            <div className="p-3" style={{ background: 'var(--panel)' }}>
              <form action={atualizarAcaoDados}>
                <input type="hidden" name="acaoId" value={a.id} />
                <div className="field">
                  <label className="field-lbl">Nome</label>
                  <input name="nome" className="input" required minLength={3} defaultValue={a.nome} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="field">
                    <label className="field-lbl">Tempo necessário</label>
                    <select name="tempoNecessario" className="select" required defaultValue={a.tempoNecessario ?? ''}>
                      <option value="" disabled>Selecione…</option>
                      {TEMPO_OPCOES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <div className="text-[10.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
                      A faixa define o período de execução da ação.
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-lbl">Alvo · Unidade</label>
                    <div className="flex gap-1.5">
                      <input name="alvo" type="number" step="0.01" className="input" required defaultValue={a.alvo} style={{ flex: '0 0 90px' }} />
                      <UnidadeInput defaultValue={a.unidade} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-lbl">Responsável</label>
                    <select name="responsavelId" className="select" defaultValue={a.responsavelId ?? ''}>
                      <option value="">— sem responsável —</option>
                      {responsaveisCandidatos.map(u => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field">
                    <label className="field-lbl">Início · mês / ano</label>
                    <MesAnoPicker name="inicio" defaultValue={a.inicio} label="Mês e ano de início" />
                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                      Antes deste mês → &ldquo;ainda não iniciada&rdquo;. A partir daqui, começa a contar o tempo.
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-lbl">Prazo estimado</label>
                    <PrazoDerivado inicio={a.inicio} tempo={a.tempoNecessario} />
                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                      Calculado como <b>início + máx. do tempo necessário</b>. Se passar sem concluir, vira &ldquo;em atraso&rdquo;.
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <button type="submit" className="btn btn-primary btn-sm">Salvar ação</button>
                </div>
              </form>
              <form action={deletarAcao} className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--rule)' }}>
                <input type="hidden" name="acaoId" value={a.id} />
                <button type="submit" className="btn btn-danger btn-sm">Excluir ação</button>
              </form>
            </div>
          </details>
        ))}

        <details className="mt-3 border" style={{ borderColor: 'var(--brass)' }}>
          <summary className="cursor-pointer p-2.5 list-none font-medium text-[13px]" style={{ background: 'rgba(166,119,53,0.10)', color: 'var(--brass)' }}>
            + Nova ação
          </summary>
          <form action={criarAcao} className="p-3" style={{ background: 'var(--panel)' }}>
            <input type="hidden" name="metaCPId" value={m.id} />
            <div className="field">
              <label className="field-lbl">Nome</label>
              <input name="nome" className="input" required minLength={3} placeholder="Ex.: Contratar equipe de campo" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="field">
                <label className="field-lbl">Tempo necessário</label>
                <select name="tempoNecessario" className="select" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {TEMPO_OPCOES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div className="text-[10.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
                  A faixa define o período de execução da ação.
                </div>
              </div>
              <div className="field">
                <label className="field-lbl">Alvo · Unidade</label>
                <div className="flex gap-1.5">
                  <input name="alvo" type="number" step="0.01" className="input" required defaultValue={1} style={{ flex: '0 0 90px' }} />
                  <UnidadeInput />
                </div>
              </div>
              <div className="field">
                <label className="field-lbl">Responsável</label>
                <select name="responsavelId" className="select" defaultValue="">
                  <option value="">— sem responsável —</option>
                  {responsaveisCandidatos.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="field-lbl">Início · mês / ano</label>
                <MesAnoPicker name="inicio" label="Mês e ano de início" />
                <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                  Antes deste mês → &ldquo;ainda não iniciada&rdquo;. A partir daqui, começa a contar o tempo.
                </div>
              </div>
              <div className="field">
                <label className="field-lbl">Prazo estimado</label>
                <div className="input" style={{ background: 'var(--paper-3)', color: 'var(--ink-3)' }}>
                  Definido pelo tempo necessário
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                  Calculado como <b>início + máx. do tempo necessário</b>. Se passar sem concluir, vira &ldquo;em atraso&rdquo;.
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-2">
              <button type="submit" className="btn btn-primary btn-sm">Criar ação</button>
            </div>
          </form>
        </details>
      </div>
    </>
  );
}

// Mostra o prazo derivado (início + máximo do tempo necessário) formatado em
// "mês/ano". Não é um campo de input — é só a visualização do que o sistema
// vai considerar como limite.
function PrazoDerivado({ inicio, tempo }: { inicio: string | null; tempo: string | null }) {
  const prazo = calcPrazoFinal(inicio, tempo);
  if (!prazo) {
    return (
      <div className="input" style={{ background: 'var(--paper-3)', color: 'var(--ink-3)' }}>
        Preencha início e tempo
      </div>
    );
  }
  const txt = fmtMesAno(prazo);
  const atrasado = new Date() > prazo;
  return (
    <div
      className="input"
      style={{
        background: 'var(--paper-3)',
        color: atrasado ? 'var(--late)' : 'var(--ink)',
        fontWeight: 500
      }}
    >
      {txt}{atrasado && ' · já venceu'}
    </div>
  );
}

