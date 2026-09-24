'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SidebarNav({ pendentesQ, canUsers }: { pendentesQ: number; canUsers: boolean }) {
  const pathname = usePathname();

  return (
    <>
      <NavGroup label="Trabalho" />
      <NavItem href="/painel" label="Painel" active={pathname.startsWith('/painel')} />
      <NavItem href="/metas" label="Metas" active={pathname.startsWith('/metas')} />
      <NavItem href="/propostas" label="Propostas" active={pathname.startsWith('/propostas')} badge={pendentesQ || undefined} />
      <NavGroup label="Governança" />
      <NavItem href="/organograma" label="Organograma" active={pathname.startsWith('/organograma')} />
      <NavItem href="/auditoria" label="Auditoria" active={pathname.startsWith('/auditoria')} />
      <NavItem href="/usuarios" label="Usuários" active={pathname.startsWith('/usuarios')} disabled={!canUsers} />
    </>
  );
}

function NavGroup({ label }: { label: string }) {
  return (
    <div className="px-5 pt-3 pb-2 font-mono text-[11.5px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>
      {label}
    </div>
  );
}

function NavItem({ href, label, active, disabled, badge }: {
  href: string; label: string; active?: boolean; disabled?: boolean; badge?: number;
}) {
  const content = (
    <div
      className="grid grid-cols-[1fr_auto] items-center px-5 py-2.5 text-[16px] border-l-2"
      style={{
        background: active ? 'rgba(166,119,53,0.10)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        borderLeftColor: active ? 'var(--brass)' : 'transparent',
        fontWeight: active ? 500 : 400,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      <span>{label}</span>
      {badge ? (
        <span
          className="font-mono text-[11.5px] px-2 py-0.5 rounded-full tabular-nums"
          style={{ background: 'var(--brass)', color: 'var(--paper-2)' }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
  if (disabled) return content;
  return <Link href={href} className="block hover:opacity-80">{content}</Link>;
}
