import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, writableSecretariasOf } from '@/lib/rbac';
import Link from 'next/link';
import { NovaMetaForm } from './NovaMetaForm';

export const dynamic = 'force-dynamic';

export default async function NovaMetaPage({ searchParams }: { searchParams: Promise<{ sec?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const [secretarias, divisoes, metasLP] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.divisao.findMany({ orderBy: { nome: 'asc' } }),
    prisma.metaLP.findMany({ orderBy: { capitulo: 'asc' } })
  ]);

  const writable = writableSecretariasOf(user, secretarias.map(s => s.id));
  const podeCriar = secretarias.filter(s => writable.has(s.id) && can(user, 'meta.create', { secretariaDonaId: s.id }));

  if (podeCriar.length === 0) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="rbac-note">
          <b>RBAC ativo</b> — apenas prefeito e secretários podem criar metas diretamente. Se você precisa sugerir uma meta, envie uma <Link href="/propostas/nova" style={{ color: 'var(--brass)' }}>proposta</Link>.
        </div>
        <Link href="/metas" className="btn">Voltar</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const secDefault = sp.sec && podeCriar.some(s => s.id === sp.sec)
    ? sp.sec
    : podeCriar[0].id;

  return (
    <>
      <Link href="/metas" className="btn btn-ghost btn-sm mb-2">← Voltar</Link>

      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="mb-4">
          <h1 className="font-display text-[22px] sm:text-[24px] leading-tight m-0 mb-1">Nova meta</h1>
          <p className="text-[12.5px] m-0" style={{ color: 'var(--ink-2)' }}>
            Meta de curto prazo vinculada a um capítulo do plano de governo.
          </p>
        </div>

        <NovaMetaForm
          metasLP={metasLP}
          podeCriar={podeCriar}
          divisoes={divisoes}
          secretarias={secretarias}
          secDefault={secDefault}
          podeMarcarPrincipal={user.perfil === 'prefeito'}
        />
      </div>
    </>
  );
}
