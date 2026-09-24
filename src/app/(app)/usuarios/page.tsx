import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { fmtDateTime } from '@/lib/format';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ sec?: string; perfil?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const isPrefeito = user.perfil === 'prefeito';
  const isSecretario = user.perfil === 'secretario';

  // Só prefeito e secretário podem abrir esta tela.
  if (!isPrefeito && !isSecretario) {
    redirect('/painel');
  }

  const sp = await searchParams;
  const filterSec = sp.sec ?? 'all';
  const filterPerfil = sp.perfil ?? 'all';

  const [secretarias, usuarios] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.usuario.findMany({
      include: { lotacoes: { include: { secretaria: true, divisao: true } } },
      orderBy: { nome: 'asc' }
    })
  ]);

  // Escopo por perfil: secretário só vê quem tem lotação nas secretarias dele.
  const secIdsUser = new Set(user.lotacoes.map(l => l.secretariaId));
  const escopo = usuarios.filter(u => {
    if (isPrefeito) return true;
    return u.lotacoes.some(l => secIdsUser.has(l.secretariaId));
  });

  const secretariasDisponiveis = isPrefeito
    ? secretarias
    : secretarias.filter(s => secIdsUser.has(s.id));

  const filtered = escopo.filter(u => {
    if (filterPerfil !== 'all' && u.perfil !== filterPerfil) return false;
    if (filterSec !== 'all' && !u.lotacoes.some(l => l.secretariaId === filterSec)) return false;
    return true;
  });

  const canManageAnyone = isPrefeito ||
    (isSecretario && filtered.some(u =>
      can(user, 'user.manageSecretaria', { secretariaDonaId: u.lotacoes[0]?.secretariaId })
    ));

  return (
    <>
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="font-display text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Usuários</h1>
          <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
            {filtered.length} de {escopo.length} pessoas visíveis com seu perfil.
          </p>
        </div>
        {canManageAnyone && (
          <Link href="/usuarios/novo" className="btn btn-primary btn-sm">+ Novo usuário</Link>
        )}
      </div>

      {isSecretario && (
        <div className="rbac-note">
          <b>Escopo</b> · você vê apenas pessoas lotadas em secretarias sob sua responsabilidade.
        </div>
      )}

      <form className="flex gap-2 mb-4 items-center flex-wrap">
        <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>Filtros:</span>
        <select name="sec" defaultValue={filterSec} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todas as secretarias</option>
          {secretariasDisponiveis.map(s => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        <select name="perfil" defaultValue={filterPerfil} className="select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12.5px' }}>
          <option value="all">Todos os perfis</option>
          <option value="prefeito">Prefeito</option>
          <option value="secretario">Secretário</option>
          <option value="chefe">Chefe</option>
        </select>
        <button type="submit" className="btn btn-sm">Aplicar</button>
      </form>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Lotações</th>
              <th style={{ width: 140 }}>Último acesso</th>
              <th style={{ textAlign: 'center', width: 80 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td className="font-medium">
                  {u.nome}
                  {u.lotacoes.length > 1 && (
                    <span className="pill pill-brass ml-1.5" title="Múltiplas lotações">multi</span>
                  )}
                </td>
                <td className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>{u.email}</td>
                <td>
                  <span className={`pill ${pillForPerfil(u.perfil)}`}>{u.perfil}</span>
                </td>
                <td>
                  {u.lotacoes.length === 0
                    ? <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>—</span>
                    : (
                      <div className="flex flex-col gap-0.5">
                        {u.lotacoes.map(l => (
                          <div key={l.id} className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                            {l.secretaria.nome}
                            {l.divisao && (
                              <span className="italic" style={{ color: 'var(--brass)' }}> · {l.divisao.nome}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  }
                </td>
                <td className="text-[12px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  {fmtDateTime(u.ultimoAcesso)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`pill ${u.ativo ? 'pill-ok' : 'pill-late'}`}>
                    {u.ativo ? 'ativo' : 'inativo'}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: 'var(--ink-3)' }}>Nenhum usuário encontrado com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function pillForPerfil(perfil: string): string {
  if (perfil === 'prefeito') return 'pill-nav';
  if (perfil === 'secretario') return 'pill-brass';
  if (perfil === 'chefe') return 'pill-warn';
  return 'pill-neutral';
}
