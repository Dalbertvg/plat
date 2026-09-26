import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { aprovarProposta, rejeitarProposta } from '@/actions/propostas';
import { fmtDateTime } from '@/lib/format';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { BotaoEnviar } from '@/components/BotaoEnviar';
import { carregarNomesOrganizacao } from '@/lib/painel';

export const dynamic = 'force-dynamic';

// As listas "Suas propostas" e "Outras" crescem para sempre; mostram as mais
// recentes e o link "Ver mais" amplia. As que aguardam o usuário aparecem sempre.
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 1000;

const CAMPOS_LISTA = {
  id: true, titulo: true, descricao: true, status: true, proximoRevisor: true, criadoEm: true,
  autorId: true, secretariaDonaId: true, divisaoOrigemId: true,
  autor: { select: { nome: true } }
} satisfies Prisma.PropostaSelect;

export default async function PropostasPage({ searchParams }: { searchParams: Promise<{ limite?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const sp = await searchParams;
  const limite = Math.min(LIMITE_MAXIMO, Math.max(LIMITE_PADRAO, Math.floor(Number(sp.limite)) || LIMITE_PADRAO));

  const secIds = user.lotacoes.map(l => l.secretariaId);
  const divIds = user.lotacoes.map(l => l.divisaoId).filter(Boolean) as string[];

  // Escopo de VISIBILIDADE — mesma regra de "quem tem envolvimento" usada em
  // podeComentarProposta (lib/rbac.ts): o autor, o secretário dono da
  // secretaria alvo, o chefe da divisão de origem, e sempre o prefeito.
  // Ninguém fora dessa linha direta deve ver a proposta.
  const escopoWhere: Prisma.PropostaWhereInput =
    user.perfil === 'prefeito'
      ? {}
      : {
          OR: [
            { autorId: user.id },
            ...(user.perfil === 'secretario' ? [{ secretariaDonaId: { in: secIds } }] : []),
            ...(user.perfil === 'chefe' && divIds.length ? [{ divisaoOrigemId: { in: divIds } }] : [])
          ]
        };

  const [nomes, pendentesNoEscopo, minhasMais] = await Promise.all([
    carregarNomesOrganizacao(),
    prisma.proposta.findMany({
      where: { AND: [escopoWhere, { status: 'pendente' }] },
      select: CAMPOS_LISTA,
      orderBy: { criadoEm: 'desc' }
    }),
    prisma.proposta.findMany({
      where: { autorId: user.id },
      select: CAMPOS_LISTA,
      orderBy: { criadoEm: 'desc' },
      take: limite + 1
    })
  ]);

  const pendentes = pendentesNoEscopo.filter(p => {
    if (p.proximoRevisor === 'chefe') return can(user, 'proposta.approveAsChefe', { divisaoOrigemId: p.divisaoOrigemId });
    if (p.proximoRevisor === 'secretario') return can(user, 'proposta.approveAsSecretario', { secretariaDonaId: p.secretariaDonaId });
    if (p.proximoRevisor === 'prefeito') return user.perfil === 'prefeito';
    return false;
  });

  const outrasMais = await prisma.proposta.findMany({
    where: {
      AND: [
        escopoWhere,
        { autorId: { not: user.id } },
        ...(pendentes.length ? [{ id: { notIn: pendentes.map(p => p.id) } }] : [])
      ]
    },
    select: CAMPOS_LISTA,
    orderBy: { criadoEm: 'desc' },
    take: limite + 1
  });

  const minhas = minhasMais.slice(0, limite);
  const outras = outrasMais.slice(0, limite);
  const temMais = minhasMais.length > limite || outrasMais.length > limite;

  // Só a última nota de cada proposta exibida (antes vinham TODOS os
  // comentários de todas as propostas para mostrar um por linha).
  const idsComNota = [...pendentes, ...outras].map(p => p.id);
  const ultimas = idsComNota.length
    ? await prisma.$queryRaw<Array<{ propostaId: string; texto: string }>>`
        SELECT DISTINCT ON ("propostaId") "propostaId", texto
        FROM "Comentario"
        WHERE "propostaId" = ANY(${idsComNota})
        ORDER BY "propostaId", quando DESC`
    : [];
  const ultimaNota = new Map(ultimas.map(u => [u.propostaId, u.texto]));

  return (
    <>
      <div className="mb-6 flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="font-display text-[24px] sm:text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Propostas</h1>
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
          {pendentes.map(p => <PropostaRow key={p.id} p={p} nomes={nomes} ultimaNota={ultimaNota.get(p.id)} actionable />)}
        </div>
      )}

      {minhas.length > 0 && (
        <div className="panel mb-4">
          <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
            <div className="font-display text-[15px] font-semibold">Suas propostas</div>
          </div>
          {minhas.map(p => <PropostaRow key={p.id} p={p} nomes={nomes} />)}
        </div>
      )}

      <div className="panel">
        <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
          <div className="font-display text-[15px] font-semibold">Outras propostas visíveis</div>
        </div>
        {outras.length === 0
          ? <div className="text-center py-5 text-[13px]" style={{ color: 'var(--ink-3)' }}>Nenhuma outra proposta.</div>
          : outras.map(p => <PropostaRow key={p.id} p={p} nomes={nomes} ultimaNota={ultimaNota.get(p.id)} />)}
      </div>

      {temMais && (
        <div className="flex justify-center mt-4">
          {/* <a> e não <Link>: ver nota em metas/page.tsx sobre trocar só parâmetros. */}
          <a href={`/propostas?limite=${Math.min(LIMITE_MAXIMO, limite + LIMITE_PADRAO)}`} className="btn btn-sm">
            Ver mais antigas
          </a>
        </div>
      )}
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
  secretariaDonaId: string;
  divisaoOrigemId: string | null;
  autor: { nome: string };
};

type Nomes = { secretariaNome: Map<string, string>; divisaoNome: Map<string, string> };

function PropostaRow({ p, nomes, ultimaNota, actionable }: { p: PropostaRowP; nomes: Nomes; ultimaNota?: string; actionable?: boolean }) {
  const statusPill =
    p.status === 'aprovada' ? 'pill-ok' :
    p.status === 'rejeitada' ? 'pill-late' : 'pill-warn';

  return (
    <div className="py-3 border-b" style={{ borderColor: 'var(--rule)' }}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <Link href={`/propostas/${p.id}`} prefetch={false} className="font-medium hover:underline" style={{ color: 'var(--ink)' }}>{p.titulo}</Link>
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {p.autor.nome} · {nomes.secretariaNome.get(p.secretariaDonaId) ?? '—'} · {(p.divisaoOrigemId && nomes.divisaoNome.get(p.divisaoOrigemId)) || '—'} · {fmtDateTime(p.criadoEm)}
          </div>
          {p.descricao && (
            <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--ink-2)', maxWidth: '70ch' }}>{p.descricao}</div>
          )}
          {ultimaNota && (
            <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
              <b>Última nota:</b> {ultimaNota}
            </div>
          )}
        </div>
        {/* Celular: situação e botões descem para baixo do texto, alinhados à esquerda. */}
        <div className="flex flex-row flex-wrap sm:flex-col items-center sm:items-end gap-1.5 sm:min-w-[140px]">
          <span className={`pill ${statusPill}`}>{p.status}</span>
          {p.status === 'pendente' && <span className="pill pill-brass">→ {p.proximoRevisor}</span>}
          {actionable && (
            <div className="flex gap-1.5 mt-1">
              <form action={aprovarProposta}>
                <input type="hidden" name="propostaId" value={p.id} />
                <BotaoEnviar className="btn btn-brass btn-sm" enviando="Aprovando…">Aprovar</BotaoEnviar>
              </form>
              <details className="relative open:basis-full sm:open:basis-auto">
                <summary className="btn btn-danger btn-sm list-none cursor-pointer">Rejeitar</summary>
                <form action={rejeitarProposta} className="popover-form absolute left-0 sm:left-auto sm:right-0 top-full mt-1 z-10 p-3 w-72" style={{ background: 'var(--panel)', border: '1px solid var(--rule-strong)', borderRadius: 3 }}>
                  <input type="hidden" name="propostaId" value={p.id} />
                  <textarea name="motivo" required placeholder="Motivo da rejeição…" className="textarea" style={{ minHeight: 60, fontSize: 12 }} />
                  <BotaoEnviar className="btn btn-danger btn-sm mt-2 w-full" enviando="Rejeitando…">Confirmar rejeição</BotaoEnviar>
                </form>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
