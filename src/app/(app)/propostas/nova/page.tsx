import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { readableSecretariasOf, can, proximoRevisorDe } from '@/lib/rbac';
import Link from 'next/link';
import { NovaPropostaForm } from './NovaPropostaForm';

export const dynamic = 'force-dynamic';

export default async function NovaPropostaPage({
  searchParams
}: {
  searchParams: Promise<{ metaId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;
  if (!can(user, 'proposta.submit')) {
    return (
      <div className="panel">
        <div className="rbac-note"><b>RBAC ativo</b> — o Prefeito não submete propostas; ele aprova. Troque de persona para submeter.</div>
        <Link href="/propostas" className="btn">Voltar</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const metaContexto = sp.metaId
    ? await prisma.metaCP.findUnique({
        where: { id: sp.metaId },
        select: { id: true, nome: true, secretariaDonaId: true }
      })
    : null;

  const [secretarias, divisoes, metasCP] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.divisao.findMany({ orderBy: { nome: 'asc' } }),
    // Metas arquivadas saem da lista de alvos — não faz sentido propor edição
    // pra algo que o prefeito já encerrou.
    prisma.metaCP.findMany({ where: { arquivada: false }, orderBy: { id: 'asc' } })
  ]);

  // Escopo de propostas — mais estreito que o de leitura:
  //  - Secretário: pode propor pra qualquer secretaria (a dele vai direto ao prefeito;
  //    outras passam pelo secretário dono primeiro).
  //  - Chefe: só a própria secretaria de lotação.
  const secretariasPermitidas: typeof secretarias = (() => {
    if (user.perfil === 'secretario') {
      const readable = readableSecretariasOf(user, secretarias.map(s => s.id));
      return secretarias.filter(s => readable.has(s.id));
    }
    // chefe
    const dele = new Set(user.lotacoes.map(l => l.secretariaId));
    return secretarias.filter(s => dele.has(s.id));
  })();
  const visiveis = secretariasPermitidas;

  // Se veio de uma meta específica, o revisor é calculado com base na secretaria dela.
  const secParaRevisor = metaContexto?.secretariaDonaId ?? visiveis[0]?.id ?? '';
  const revisorPreview = secParaRevisor ? proximoRevisorDe(user, secParaRevisor) : '—';
  const revisorHint =
    revisorPreview === 'chefe' ? 'chefe da divisão' :
    revisorPreview === 'secretario' ? 'secretário da secretaria alvo' :
    'prefeito';

  // Rota "voltar" respeita o contexto: veio da meta, volta para a meta.
  const backHref = metaContexto ? `/metas/${metaContexto.id}` : '/propostas';
  const backLabel = metaContexto ? '← Voltar para a meta' : '← Voltar';

  return (
    <>
      <Link href={backHref} className="btn btn-ghost btn-sm mb-2">{backLabel}</Link>

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="mb-4">
          <h1 className="font-display text-[22px] sm:text-[24px] leading-tight m-0 mb-1">
            {metaContexto ? 'Propor edição desta meta' : 'Nova proposta'}
          </h1>
          <p className="text-[12.5px] m-0" style={{ color: 'var(--ink-2)' }}>
            Como <b>{user.perfil}</b>, sua proposta segue o fluxo hierárquico até quem tem autonomia para aprová-la.
          </p>
        </div>

        <NovaPropostaForm
          visiveis={visiveis}
          divisoes={divisoes}
          metasCP={metasCP}
          lotacoesUser={user.lotacoes}
          perfil={user.perfil}
          revisorHint={revisorHint}
          metaContexto={metaContexto}
        />
      </div>
    </>
  );
}
