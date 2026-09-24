import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fmtDateTime, initials } from '@/lib/format';
import { podeComentarProposta } from '@/lib/rbac';
import { responderProposta } from '@/actions/propostas';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type TimelineStep = {
  tag: string;
  atorNome: string;
  perfil: string;
  quando: Date;
  msg: string;
};

const TAG_LABELS: Record<string, { label: string; color: string }> = {
  'PROPOSTA:CRIADA':       { label: 'Criada',       color: 'var(--ink-2)' },
  'PROPOSTA:ENCAMINHADA':  { label: 'Encaminhada',  color: 'var(--brass)' },
  'PROPOSTA:APROVADA':     { label: 'Aprovada',     color: 'var(--ok, #2a8a2a)' },
  'PROPOSTA:REJEITADA':    { label: 'Rejeitada',    color: 'var(--danger, #c33)' },
  'ACAO:APLICADA_VIA_PROPOSTA':  { label: 'Ação alterada',  color: 'var(--ok, #2a8a2a)' },
  'META:APLICADA_VIA_PROPOSTA':  { label: 'Meta alterada',  color: 'var(--ok, #2a8a2a)' },
  'META:CRIADA_VIA_PROPOSTA':    { label: 'Meta criada',    color: 'var(--ok, #2a8a2a)' },
};

export default async function PropostaTimelinePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const { id } = await params;

  const proposta = await prisma.proposta.findUnique({
    where: { id },
    include: {
      autor: true,
      secretariaDona: true,
      divisaoOrigem: true,
      comentarios: { include: { autor: true }, orderBy: { quando: 'asc' } }
    }
  });

  if (!proposta) return notFound();

  const podeComentar = podeComentarProposta(user, proposta);

  // Comentários já aparecem por completo na Conversa abaixo — não duplica na timeline.
  const auditoria = await prisma.auditoria.findMany({
    where: { entidade: 'proposta', entidadeId: id, tag: { not: 'PROPOSTA:COMENTARIO' } },
    orderBy: { quando: 'asc' }
  });

  const aplicacaoAuditoria = proposta.metaCPRefId
    ? await prisma.auditoria.findMany({
        where: {
          tag: { in: ['ACAO:APLICADA_VIA_PROPOSTA', 'META:APLICADA_VIA_PROPOSTA', 'META:CRIADA_VIA_PROPOSTA'] },
          msg: { contains: proposta.titulo }
        },
        orderBy: { quando: 'asc' }
      })
    : [];

  const steps: TimelineStep[] = [
    ...auditoria.map(a => ({ tag: a.tag, atorNome: a.atorNome, perfil: a.perfil, quando: a.quando, msg: a.msg })),
    ...aplicacaoAuditoria.map(a => ({ tag: a.tag, atorNome: a.atorNome, perfil: a.perfil, quando: a.quando, msg: a.msg }))
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());

  const statusPill =
    proposta.status === 'aprovada' ? 'pill-ok' :
    proposta.status === 'rejeitada' ? 'pill-late' : 'pill-warn';

  const tipoLabel =
    proposta.tipo === 'nova' ? 'Nova meta' :
    proposta.tipo === 'edicao' ? 'Edição de meta' : 'Ajuste de ação';

  return (
    <>
      <Link href="/propostas" className="btn btn-ghost btn-sm mb-2">← Voltar</Link>

      <div className="panel mb-4" style={{ maxWidth: 720 }}>
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--ink-3)' }}>{proposta.id}</div>
            <h1 className="font-display text-[24px] leading-tight m-0">{proposta.titulo}</h1>
          </div>
          <span className={`pill ${statusPill}`}>{proposta.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] mb-4 pb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
          <div><span style={{ color: 'var(--ink-3)' }}>Tipo:</span> {tipoLabel}</div>
          <div><span style={{ color: 'var(--ink-3)' }}>Autor:</span> {proposta.autor.nome} ({proposta.autor.perfil})</div>
          <div><span style={{ color: 'var(--ink-3)' }}>Secretaria:</span> {proposta.secretariaDona.nome}</div>
          <div><span style={{ color: 'var(--ink-3)' }}>Divisão:</span> {proposta.divisaoOrigem?.nome ?? '—'}</div>
          <div><span style={{ color: 'var(--ink-3)' }}>Meta alvo:</span> {proposta.metaCPRefId ?? '—'}</div>
          <div><span style={{ color: 'var(--ink-3)' }}>Criada em:</span> {fmtDateTime(proposta.criadoEm)}</div>
        </div>

        {proposta.descricao && (
          <div className="text-[13.5px] mb-4 pb-4 border-b" style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)', maxWidth: '65ch' }}>
            {proposta.descricao}
          </div>
        )}

        {proposta.aplicacaoErro && (
          <div className="p-3 mb-4 border-l-4 text-[12.5px]" style={{ background: 'rgba(204,51,51,0.07)', borderColor: 'var(--danger, #c33)', color: 'var(--danger, #c33)' }}>
            <b>Erro ao aplicar alterações:</b> {proposta.aplicacaoErro}
          </div>
        )}
      </div>

      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="font-display text-[18px] font-semibold mb-4">Timeline</div>

        <div className="relative pl-6">
          <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background: 'var(--rule-strong, var(--rule))' }} />

          {steps.map((step, i) => {
            const info = TAG_LABELS[step.tag] ?? { label: step.tag, color: 'var(--ink-3)' };
            const isLast = i === steps.length - 1;
            return (
              <div key={i} className="relative pb-5" style={{ opacity: isLast ? 1 : 0.85 }}>
                <div
                  className="absolute -left-6 top-1 w-[15px] h-[15px] rounded-full border-2"
                  style={{
                    borderColor: info.color,
                    background: isLast ? info.color : 'var(--panel)'
                  }}
                />
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase" style={{ color: info.color }}>
                    {info.label}
                  </span>
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                    {fmtDateTime(step.quando)}
                  </span>
                </div>
                <div className="text-[13px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                  <b>{step.atorNome}</b> ({step.perfil})
                </div>
                <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--ink-3)', maxWidth: '60ch' }}>
                  {step.msg}
                </div>
              </div>
            );
          })}

          {proposta.status === 'pendente' && (
            <div className="relative pb-2">
              <div
                className="absolute -left-6 top-1 w-[15px] h-[15px] rounded-full border-2 border-dashed"
                style={{ borderColor: 'var(--brass)', background: 'var(--panel)' }}
              />
              <div className="font-mono text-[11px] tracking-wider uppercase" style={{ color: 'var(--brass)' }}>
                Aguardando {proposta.proximoRevisor}
              </div>
            </div>
          )}
        </div>
      </div>

      {(proposta.comentarios.length > 0 || podeComentar) && (
        <div className="panel mt-4" style={{ maxWidth: 720 }}>
          <div className="font-display text-[18px] font-semibold mb-3">Conversa</div>

          {proposta.comentarios.length === 0 ? (
            <div className="text-center py-5 text-[13px] mb-3" style={{ color: 'var(--ink-3)' }}>
              Nenhuma mensagem ainda — comece a conversa abaixo.
            </div>
          ) : (
            <div className="flex flex-col gap-3 mb-4">
              {proposta.comentarios.map(c => {
                const propria = c.autorId === user.id;
                return (
                  <div key={c.id} className="flex gap-2.5" style={{ flexDirection: propria ? 'row-reverse' : 'row' }}>
                    <span
                      className="w-7 h-7 rounded-full grid place-items-center font-display text-[11px] font-semibold flex-none"
                      style={{ background: propria ? 'var(--brass)' : 'var(--rule-strong, var(--rule))', color: propria ? 'var(--on-brass)' : 'var(--ink-2)' }}
                      title={c.autor.nome}
                    >
                      {initials(c.autor.nome)}
                    </span>
                    <div style={{ maxWidth: '75%' }}>
                      <div
                        className="text-[13.5px] px-3 py-2"
                        style={{
                          background: propria ? 'rgba(166,119,53,0.12)' : 'var(--paper-3)',
                          border: '1px solid var(--rule)',
                          borderRadius: propria ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                          color: 'var(--ink)'
                        }}
                      >
                        {c.texto}
                      </div>
                      <div
                        className="text-[11px] mt-1"
                        style={{ color: 'var(--ink-3)', textAlign: propria ? 'right' : 'left' }}
                      >
                        {c.autor.nome} ({c.autor.perfil}) · {fmtDateTime(c.quando)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {podeComentar && (
            <form action={responderProposta} className="flex gap-2 items-start pt-3 border-t" style={{ borderColor: 'var(--rule)' }}>
              <input type="hidden" name="propostaId" value={proposta.id} />
              <textarea
                name="texto"
                required
                minLength={1}
                maxLength={1000}
                placeholder="Escreva uma mensagem para quem acompanha esta proposta…"
                className="textarea flex-1"
                style={{ minHeight: 44 }}
              />
              <button type="submit" className="btn btn-primary btn-sm">Enviar</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
