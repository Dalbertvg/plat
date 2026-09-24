import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { aprovarProposta, rejeitarProposta } from '@/actions/propostas';
import { fmtDateTime } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PropostasPage() {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const secIds = user.lotacoes.map(l => l.secretariaId);
  const divIds = user.lotacoes.map(l => l.divisaoId).filter(Boolean) as string[];

  // Escopo de VISIBILIDADE — mesma regra de "quem tem envolvimento" usada em
  // podeComentarProposta (lib/rbac.ts): o autor, o secretário dono da
  // secretaria alvo, o chefe da divisão de origem, e sempre o prefeito.
  // Ninguém fora dessa linha direta deve ver a proposta.
  const escopoWhere =
    user.perfil === 'prefeito'
      ? {}
      : {
          OR: [
            { autorId: user.id },
            ...(user.perfil === 'secretario' ? [{ secretariaDonaId: { in: secIds } }] : []),
            ...(user.perfil === 'chefe' && divIds.length ? [{ divisaoOrigemId: { in: divIds } }] : [])
          ]
        };

  const [allPropostas, minhas] = await Promise.all([
    prisma.proposta.findMany({
      where: escopoWhere,
      include: { autor: true, secretariaDona: true, divisaoOrigem: true, comentarios: { include: { autor: true }, orderBy: { quando: 'desc' } } },
      orderBy: { criadoEm: 'desc' }
    }),
    prisma.proposta.findMany({
      where: { autorId: user.id },
      include: { autor: true, secretariaDona: true, divisaoOrigem: true },
      orderBy: { criadoEm: 'desc' }
    })
  ]);

  const pendentes = allPropostas.filter(p => {
    if (p.status !== 'pendente') return false;
    if (p.proximoRevisor === 'chefe') return can(user, 'proposta.approveAsChefe', { divisaoOrigemId: p.divisaoOrigemId });
    if (p.proximoRevisor === 'secretario') return can(user, 'proposta.approveAsSecretario', { secretariaDonaId: p.secretariaDonaId });
    if (p.proximoRevisor === 'prefeito') return user.perfil === 'prefeito';
    return false;
  });

  const outras = allPropostas.filter(p =>
    !pendentes.find(x => x.id === p.id) && p.autorId !== user.id
  );

  return (
    <>
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="font-display text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Propostas</h1>
          <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
            Fluxo: chefe → secretário → publicado. Cada movimento entra na auditoria.
          </p>
        </div>
        {can(user, 'proposta.submit') && (
          <Link href="/propostas/nova" className="btn btn-primary btn-sm">+ Nova proposta</Link>
        )}
      </div>

      {pendentes.length > 0 && (
        <div className="panel mb-4" style={{ borderColor: 'var(--brass)', background: 'rgba(166,119,53,0.06)' }}>
          <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'rgba(166,119,53,0.3)' }}>
            <div className="font-display text-[15px] font-semibold" style={{ color: 'var(--brass)' }}>Aguardando você ({pendentes.length})</div>
          </div>
          {pendentes.map(p => <PropostaRow key={p.id} p={p} actionable />)}
        </div>
      )}

      {minhas.length > 0 && (
        <div className="panel mb-4">
          <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
            <div className="font-display text-[15px] font-semibold">Suas propostas</div>
          </div>
          {minhas.map(p => <PropostaRow key={p.id} p={p} />)}
        </div>
      )}

      <div className="panel">
        <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
          <div className="font-display text-[15px] font-semibold">Outras propostas visíveis</div>
        </div>
        {outras.length === 0
          ? <div className="text-center py-5 text-[13px]" style={{ color: 'var(--ink-3)' }}>Nenhuma outra proposta.</div>
          : outras.map(p => <PropostaRow key={p.id} p={p} />)}
      </div>
    </>
  );
}

type PropostaRowP = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  proximoRevisor: string;
  criadoEm: Date;
  autor: { nome: string };
  secretariaDona: { nome: string };
  divisaoOrigem: { nome: string } | null;
  comentarios?: { texto: string; autor: { nome: string } }[];
};

function PropostaRow({ p, actionable }: { p: PropostaRowP; actionable?: boolean }) {
  const statusPill =
    p.status === 'aprovada' ? 'pill-ok' :
    p.status === 'rejeitada' ? 'pill-late' : 'pill-warn';

  return (
    <div className="py-3 border-b" style={{ borderColor: 'var(--rule)' }}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <Link href={`/propostas/${p.id}`} className="font-medium hover:underline" style={{ color: 'var(--ink)' }}>{p.titulo}</Link>
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {p.autor.nome} · {p.secretariaDona.nome} · {p.divisaoOrigem?.nome ?? '—'} · {fmtDateTime(p.criadoEm)}
          </div>
          {p.descricao && (
            <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--ink-2)', maxWidth: '70ch' }}>{p.descricao}</div>
          )}
          {p.comentarios && p.comentarios.length > 0 && (
            <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
              <b>Última nota:</b> {p.comentarios[0].texto}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 min-w-[140px]">
          <span className={`pill ${statusPill}`}>{p.status}</span>
          {p.status === 'pendente' && <span className="pill pill-brass">→ {p.proximoRevisor}</span>}
          {actionable && (
            <div className="flex gap-1.5 mt-1">
              <form action={aprovarProposta}>
                <input type="hidden" name="propostaId" value={p.id} />
                <button className="btn btn-brass btn-sm" type="submit">Aprovar</button>
              </form>
              <details className="relative">
                <summary className="btn btn-danger btn-sm list-none cursor-pointer">Rejeitar</summary>
                <form action={rejeitarProposta} className="absolute right-0 top-full mt-1 z-10 p-3 w-72" style={{ background: 'var(--panel)', border: '1px solid var(--rule-strong)', borderRadius: 3 }}>
                  <input type="hidden" name="propostaId" value={p.id} />
                  <textarea name="motivo" required placeholder="Motivo da rejeição…" className="textarea" style={{ minHeight: 60, fontSize: 12 }} />
                  <button className="btn btn-danger btn-sm mt-2 w-full" type="submit">Confirmar rejeição</button>
                </form>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
