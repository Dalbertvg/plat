'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Menu em gaveta para telas menores que 1024 px (celular e tablet em pé), onde
// não cabe a barra lateral fixa. O conteúdo (navegação, usuário, Sair) vem
// pronto do AppShell como children. Fecha ao trocar de tela, ao clicar num
// link, no fundo escurecido ou com Esc.
export function MenuMovel({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const gavetaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setAberto(false); }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('keydown', aoTeclar);
    // Trava a rolagem da página por trás da gaveta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    gavetaRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
      botaoRef.current?.focus();
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className="lg:hidden grid place-items-center rounded"
        style={{ width: 40, height: 40, color: '#F6F2EA', background: 'rgba(246,242,234,0.08)', border: '1px solid rgba(246,242,234,0.14)', flex: 'none' }}
        aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={aberto}
        aria-controls="menu-movel"
        onClick={() => setAberto(v => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {aberto
            ? <><path d="M5 5l10 10" /><path d="M15 5L5 15" /></>
            : <><path d="M3 5.5h14" /><path d="M3 10h14" /><path d="M3 14.5h14" /></>}
        </svg>
      </button>

      <div className="lg:hidden" hidden={!aberto}>
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setAberto(false)}
          aria-hidden
        />
        <div
          id="menu-movel"
          ref={gavetaRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-y-auto outline-none"
          style={{ width: 'min(300px, 86vw)', background: 'var(--panel)', borderRight: '1px solid var(--rule)', boxShadow: '4px 0 24px rgba(0,0,0,0.25)' }}
          onClick={e => { if ((e.target as HTMLElement).closest('a, [data-fecha-menu]')) setAberto(false); }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
