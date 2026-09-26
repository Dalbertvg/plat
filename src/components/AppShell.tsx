import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { initials } from '@/lib/format';
import { sair } from '@/actions/auth';
import { SeletorTema } from './SeletorTema';
import { SidebarNav } from './SidebarNav';
import { BotaoEnviar } from './BotaoEnviar';
import { MenuMovel } from './MenuMovel';

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

  const logos = (
    <>
      <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-2)' }}>
        Desenvolvido por
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/cubic-horizontal-principal-72.png" alt="Cubic Consultoria" className="brand-logo-color" width={105} height={36} decoding="async" loading="lazy" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/cubic-horizontal-branco-72.png" alt="Cubic Consultoria" className="brand-logo-white" width={105} height={36} decoding="async" loading="lazy" />
    </>
  );

  const avatar = (
    <span
      className="w-8 h-8 rounded-full grid place-items-center font-display font-bold text-[12px] flex-none"
      style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}
      aria-hidden
    >
      {initials(user.nome)}
    </span>
  );

  // Estrutura responsiva:
  //  - a partir de 1024 px (lg): barra superior + barra lateral fixa de 240 px,
  //    e só a área principal rola (tela cheia, como antes);
  //  - abaixo disso (celular e tablet em pé): barra superior compacta e fixa no
  //    topo, com o menu numa gaveta (MenuMovel), e a página rola normalmente.
  return (
    <div className="min-h-screen lg:h-screen lg:grid lg:grid-rows-[64px_1fr] lg:overflow-hidden">
      <header
        className="sticky top-0 z-30 lg:static flex items-center gap-3 h-14 lg:h-auto px-3 sm:px-4 lg:px-6 border-b"
        style={{ background: 'var(--navy-surface)', color: '#F6F2EA', borderColor: 'var(--rule)' }}
      >
        <MenuMovel>
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--rule)' }}>
            {avatar}
            <span className="leading-tight min-w-0">
              <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{user.nome}</span>
              <span className="block font-mono text-[10px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
                {PERFIL_LABEL[user.perfil]}
              </span>
            </span>
          </div>
          <nav className="pt-3" aria-label="Menu principal">
            <SidebarNav pendentesQ={pendentesQ} canUsers={canUsers} />
          </nav>
          <SeletorTema temaInicial={user.tema} />
          <div className="mt-auto px-5 py-4 border-t flex flex-col items-start gap-3" style={{ borderColor: 'var(--rule)' }}>
            <form action={sair} className="w-full">
              <BotaoEnviar className="btn w-full justify-center" enviando="Saindo…">Sair</BotaoEnviar>
            </form>
            <div className="flex flex-col items-start gap-2">{logos}</div>
          </div>
        </MenuMovel>

        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:grid w-9 h-9 rounded-full place-items-center font-display font-bold text-[17px] flex-none" style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}>U</div>
          <div className="min-w-0">
            <div className="font-display text-[17px] leading-none truncate" style={{ letterSpacing: '-0.01em' }}>Plano de Metas</div>
            <div className="hidden sm:block font-mono text-[11.5px] tracking-widest uppercase mt-1" style={{ color: 'rgba(246,242,234,0.65)' }}>Prefeitura de Ubá · MG</div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 min-w-0">
          {avatar}
          <span className="hidden md:block leading-tight text-sm min-w-0">
            <span className="block font-medium truncate">{user.nome}</span>
            <span className="block font-mono text-[9.5px] tracking-wider uppercase" style={{ color: 'rgba(246,242,234,0.6)' }}>
              {PERFIL_LABEL[user.perfil]}
            </span>
          </span>
          <form action={sair} className="hidden sm:block">
            <BotaoEnviar
              className="px-3 py-1.5 rounded border text-sm"
              style={{ background: 'rgba(246,242,234,0.08)', borderColor: 'rgba(246,242,234,0.14)', color: '#F6F2EA' }}
              enviando="Saindo…"
            >
              Sair
            </BotaoEnviar>
          </form>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:overflow-hidden">
        <aside className="hidden lg:flex border-r py-5 overflow-y-auto flex-col" style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}>
          <nav aria-label="Menu principal">
            <SidebarNav pendentesQ={pendentesQ} canUsers={canUsers} />
          </nav>
          <SeletorTema temaInicial={user.tema} />
          <div className="mt-auto px-5 pt-4">
            <div className="pt-4 border-t flex flex-col items-start gap-2" style={{ borderColor: 'var(--rule)' }}>
              {logos}
            </div>
          </div>
        </aside>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8 lg:overflow-y-auto" style={{ background: 'var(--paper)' }}>
          {/* Em monitores muito largos o conteúdo não se estica além do legível. */}
          <div className="mx-auto w-full max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
