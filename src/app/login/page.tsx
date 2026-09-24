import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Entrar · Plano de Metas' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  // Checa contra o banco (não só o JWT): uma sessão revogada cai aqui no
  // formulário em vez de entrar em loop com o redirect das páginas internas.
  if (await getCurrentUser()) redirect('/painel');

  const { callbackUrl } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center px-4" style={{ background: 'var(--paper)' }}>
      <div className="w-full" style={{ maxWidth: 400 }}>
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-full grid place-items-center font-display font-bold text-[20px]"
            style={{ background: 'var(--brass)', color: 'var(--on-brass)' }}
          >
            U
          </div>
          <div>
            <div className="font-display text-[22px] leading-none" style={{ letterSpacing: '-0.01em' }}>Plano de Metas</div>
            <div className="font-mono text-[11.5px] tracking-widest uppercase mt-1" style={{ color: 'var(--ink-3)' }}>
              Prefeitura de Ubá · MG
            </div>
          </div>
        </div>

        <div className="panel">
          <h1 className="font-display text-[20px] font-semibold m-0 mb-4">Entrar</h1>
          <LoginForm callbackUrl={callbackUrl} />
        </div>

        <p className="text-[13px] mt-4 text-center" style={{ color: 'var(--ink-3)' }}>
          Acesso restrito. As credenciais são fornecidas pela administração do sistema.
        </p>

        <div className="flex flex-col items-center gap-2 mt-8">
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>
            Desenvolvido por
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/cubic-horizontal-principal.png" alt="Cubic Consultoria" className="brand-logo-color" style={{ height: 32, width: 'auto' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/cubic-horizontal-branco.png" alt="Cubic Consultoria" className="brand-logo-white" style={{ height: 32, width: 'auto' }} />
        </div>
      </div>
    </main>
  );
}
