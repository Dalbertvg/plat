import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NovoUsuarioForm } from './NovoUsuarioForm';

export const dynamic = 'force-dynamic';

export default async function NovoUsuarioPage() {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  if (user.perfil !== 'prefeito' && user.perfil !== 'secretario') {
    redirect('/painel');
  }

  const [secretarias, divisoes] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.divisao.findMany({ orderBy: { nome: 'asc' } })
  ]);

  const secretariasPermitidas = secretarias.filter(s =>
    can(user, 'user.manageSecretaria', { secretariaDonaId: s.id })
  );

  if (secretariasPermitidas.length === 0) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="rbac-note">
          <b>RBAC ativo</b> — você não tem secretarias sob sua responsabilidade para cadastrar pessoas.
        </div>
        <Link href="/usuarios" className="btn">Voltar</Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/usuarios" className="btn btn-ghost btn-sm mb-2">← Voltar</Link>

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="mb-4">
          <h1 className="font-display text-[24px] leading-tight m-0 mb-1">Novo usuário</h1>
          <p className="text-[12.5px] m-0" style={{ color: 'var(--ink-2)' }}>
            Cadastre uma nova pessoa e atribua o cargo e a lotação dela.
          </p>
        </div>

        <NovoUsuarioForm
          secretarias={secretariasPermitidas}
          divisoes={divisoes}
          podeAtribuirQualquerCargo={user.perfil === 'prefeito'}
        />
      </div>
    </>
  );
}
