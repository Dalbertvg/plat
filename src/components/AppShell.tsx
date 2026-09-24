import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { initials } from '@/lib/format';
import { sair } from '@/actions/auth';
import { LayoutPicker } from './LayoutPicker';
import { SidebarNav } from './SidebarNav';

const PERFIL_LABEL: Record<string, string> = {
  prefeito: 'Prefeito',
  secretario: 'Secretário',
  chefe: 'Chefe de divisão'
};

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const pendentesQ = await prisma.proposta.count({
    where: {
      status: 'pendente',
      OR: [
        user.perfil === 'chefe' ? {
          proximoRevisor: 'chefe',
          divisaoOrigemId: { in: user.lotacoes.map(l => l.divisaoId).filter(Boolean) as string[] }
        } : {},
        user.perfil === 'secretario' ? {
          proximoRevisor: 'secretario',
          secretariaDonaId: { in: user.lotacoes.map(l => l.secretariaId) }
        } : {},
        user.perfil === 'prefeito' ? { proximoRevisor: 'prefeito' } : {}
      ].filter(x => Object.keys(x).length > 0)
    }
  });

  const canUsers = can(user, 'user.manageGlobal') || user.perfil === 'secretario';

  return (
    <div className="grid grid-rows-[auto_64px_1fr] h-screen overflow-hidden">
      <LayoutPicker />
      <div
        className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-6 border-b"
        style={{ background: 'var(--navy-surface)', color: '#F6F2EA', borderColor: 'var(--rule)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full grid place-items-center font-display font-bold text-[17px]" style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}>U</div>
          <div>
            <div className="font-display text-[17px] leading-none" style={{ letterSpacing: '-0.01em' }}>Plano de Metas</div>
            <div className="font-mono text-[11.5px] tracking-widest uppercase mt-1" style={{ color: 'rgba(246,242,234,0.65)' }}>Prefeitura de Ubá · MG</div>
          </div>
        </div>
        <div />
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-full grid place-items-center font-display font-bold text-[12px]"
            style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}
            aria-hidden
          >
            {initials(user.nome)}
          </span>
          <span className="leading-tight text-sm">
            <span className="block font-medium">{user.nome}</span>
            <span className="block font-mono text-[9.5px] tracking-wider uppercase" style={{ color: 'rgba(246,242,234,0.6)' }}>
              {PERFIL_LABEL[user.perfil]}
            </span>
          </span>
          <form action={sair}>
            <button
              type="submit"
              className="px-3 py-1.5 rounded border text-sm"
              style={{ background: 'rgba(246,242,234,0.08)', borderColor: 'rgba(246,242,234,0.14)', color: '#F6F2EA' }}
            >
              Sair
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr] overflow-hidden">
        <nav className="border-r py-5 overflow-y-auto flex flex-col" style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}>
          <div>
            <SidebarNav pendentesQ={pendentesQ} canUsers={canUsers} />
          </div>
          <div className="mt-auto px-5 pt-4">
            <div className="pt-4 border-t flex flex-col items-start gap-2" style={{ borderColor: 'var(--rule)' }}>
              <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-2)' }}>
                Desenvolvido por
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/cubic-horizontal-principal.png" alt="Cubic Consultoria" className="brand-logo-color" style={{ height: 36, width: 'auto' }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/cubic-horizontal-branco.png" alt="Cubic Consultoria" className="brand-logo-white" style={{ height: 36, width: 'auto' }} />
            </div>
          </div>
        </nav>
        <main className="overflow-y-auto p-8" style={{ background: 'var(--paper)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
