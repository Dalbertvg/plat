import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { readableSecretariasOf } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function OrganogramaPage() {
  const user = await getCurrentUser();
  if (!user) return <div>Sem usuário.</div>;

  const [secretarias, divisoes, lotacoes, usuarios] = await Promise.all([
    prisma.secretaria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.divisao.findMany({ orderBy: { nome: 'asc' } }),
    prisma.lotacao.findMany(),
    prisma.usuario.findMany({ orderBy: { nome: 'asc' } })
  ]);

  const readable = readableSecretariasOf(user, secretarias.map(s => s.id));
  const visSecs = secretarias.filter(s => readable.has(s.id));

  const usuarioById = new Map(usuarios.map(u => [u.id, u]));
  const lotacoesByDivisao = new Map<string, typeof lotacoes>();
  const lotacoesBySecretariaSemDivisao = new Map<string, typeof lotacoes>();

  for (const l of lotacoes) {
    if (l.divisaoId) {
      const arr = lotacoesByDivisao.get(l.divisaoId) ?? [];
      arr.push(l);
      lotacoesByDivisao.set(l.divisaoId, arr);
    } else {
      const arr = lotacoesBySecretariaSemDivisao.get(l.secretariaId) ?? [];
      arr.push(l);
      lotacoesBySecretariaSemDivisao.set(l.secretariaId, arr);
    }
  }

  const totalUsuariosVisiveis = new Set(
    lotacoes
      .filter(l => readable.has(l.secretariaId))
      .map(l => l.usuarioId)
  ).size;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[28px] leading-tight m-0" style={{ letterSpacing: '-0.015em' }}>Organograma</h1>
        <p className="text-[13.5px] mt-1 m-0" style={{ color: 'var(--ink-3)' }}>
          {visSecs.length} {visSecs.length === 1 ? 'secretaria visível' : 'secretarias visíveis'} · {totalUsuariosVisiveis} pessoas lotadas.
        </p>
      </div>

      {user.perfil !== 'prefeito' && user.perfil !== 'secretario' && (
        <div className="rbac-note">
          <b>Escopo</b> · você está vendo apenas as secretarias em que possui lotação.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {visSecs.map(s => {
          const divs = divisoes.filter(d => d.secretariaId === s.id);
          const semDivisao = (lotacoesBySecretariaSemDivisao.get(s.id) ?? [])
            .map(l => usuarioById.get(l.usuarioId))
            .filter(Boolean);

          const lideranca = semDivisao.filter(u => u && (u.perfil === 'secretario' || u.perfil === 'prefeito'));
          const semDivisaoEquipe = semDivisao.filter(u => u && u.perfil !== 'secretario' && u.perfil !== 'prefeito');

          return (
            <div key={s.id} className="panel">
              <div className="flex justify-between items-baseline pb-2 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
                <div>
                  <div className="font-display text-[15px] font-semibold">{s.nome}</div>
                  {s.titular && (
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Titular: {s.titular}</div>
                  )}
                </div>
                {s.tipo === 'gabinete' && <span className="pill pill-nav">gabinete</span>}
              </div>

              {lideranca.length > 0 && (
                <div className="mb-3 pb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
                  {lideranca.map(u => u && <PersonRow key={u.id} nome={u.nome} perfil={u.perfil} />)}
                </div>
              )}

              {semDivisaoEquipe.length > 0 && (
                <div className="mb-3 pb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
                  <div className="font-mono text-[10px] tracking-widest uppercase mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Sem divisão
                  </div>
                  {semDivisaoEquipe.map(u => u && <PersonRow key={u.id} nome={u.nome} perfil={u.perfil} />)}
                </div>
              )}

              {divs.length === 0 && semDivisao.length === 0 && (
                <div className="text-center py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                  Sem divisões cadastradas.
                </div>
              )}

              {divs.map(d => {
                const pessoas = (lotacoesByDivisao.get(d.id) ?? [])
                  .map(l => usuarioById.get(l.usuarioId))
                  .filter(Boolean);

                return (
                  <div key={d.id} className="mb-3 last:mb-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{d.nome}</div>
                    </div>
                    {pessoas.length === 0
                      ? <div className="text-[11.5px] italic" style={{ color: 'var(--ink-3)' }}>Sem pessoas lotadas.</div>
                      : pessoas.map(u => u && <PersonRow key={`${d.id}:${u.id}`} nome={u.nome} perfil={u.perfil} />)
                    }
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PersonRow({ nome, perfil }: { nome: string; perfil: string }) {
  const pill =
    perfil === 'prefeito' ? 'pill-nav' :
    perfil === 'secretario' ? 'pill-brass' :
    perfil === 'chefe' ? 'pill-warn' : 'pill-neutral';
  return (
    <div className="flex justify-between items-center py-1 text-[12.5px]">
      <span style={{ color: 'var(--ink-2)' }}>{nome}</span>
      <span className={`pill ${pill}`}>{perfil}</span>
    </div>
  );
}
