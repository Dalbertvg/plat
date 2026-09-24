'use client';

import { useEffect, useState } from 'react';

// Temas de cor do app. Estrutura é sempre a "Clássica" (papel & tipografia
// serifada) — só a paleta muda. "classico" é o default (sem data-theme) e é
// o único que segue o modo claro/escuro do sistema; os demais fixam uma
// paleta própria, independente do SO (mesmo padrão do "marrom" original).
type LayoutKey = 'classico' | 'azul' | 'turquesa' | 'petroleo' | 'marrom';

const LAYOUTS: { key: LayoutKey; label: string; hint: string; sample: string }[] = [
  {
    key: 'classico',
    label: 'Clássico',
    hint: 'Papel & tipografia serifada (atual)',
    sample: 'AaBb'
  },
  {
    key: 'azul',
    label: 'Azul Cubic',
    hint: 'Claro, institucional — azul Cubic e laranja de destaque',
    sample: 'AaBb'
  },
  {
    key: 'turquesa',
    label: 'Turquesa',
    hint: 'Claro, com o verde-azulado da marca em primeiro plano',
    sample: 'AaBb'
  },
  {
    key: 'petroleo',
    label: 'Petróleo',
    hint: 'Escuro, tons de azul profundo (fixo, não segue o sistema)',
    sample: 'AaBb'
  },
  {
    key: 'marrom',
    label: 'Marrom',
    hint: 'Tons escuros e quentes, com destaque em latão (fixo, não segue o sistema)',
    sample: 'AaBb'
  }
];

const LS_LAYOUT = 'app.layout';
const LS_DISMISSED = 'app.layout.picked';

function applyToDoc(v: LayoutKey) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  // "classico" segue o tema (claro/escuro) do sistema; os demais fixam a
  // própria paleta via data-theme, não importa o modo do SO.
  if (v === 'classico') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', v);
  }
}

export function LayoutPicker() {
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState<LayoutKey>('classico');
  const [dismissed, setDismissed] = useState(true); // começa oculto para evitar flash

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(LS_LAYOUT);
      const valid: LayoutKey[] = ['azul', 'turquesa', 'petroleo', 'marrom'];
      const initial: LayoutKey = valid.includes(stored as LayoutKey) ? (stored as LayoutKey) : 'classico';
      setCurrent(initial);
      applyToDoc(initial);
      const wasDismissed = localStorage.getItem(LS_DISMISSED) === '1';
      setDismissed(wasDismissed);
    } catch {
      setDismissed(false); // sem storage: mostra o seletor
    }
  }, []);

  const pick = (v: LayoutKey) => {
    setCurrent(v);
    applyToDoc(v);
    try { localStorage.setItem(LS_LAYOUT, v); } catch {}
  };

  const confirmar = () => {
    setDismissed(true);
    try { localStorage.setItem(LS_DISMISSED, '1'); } catch {}
  };

  // Botão de reset (ficará escondido no localStorage; útil se o usuário mudar de ideia)
  const reabrir = () => {
    setDismissed(false);
    try { localStorage.removeItem(LS_DISMISSED); } catch {}
  };

  // O componente SEMPRE devolve um <div /> raiz para reservar sua linha no grid do
  // AppShell (mesmo quando "dismissed": aí ele fica com altura 0 e o botão flutuante
  // vive por cima via position: fixed, sem tirar espaço do conteúdo).
  if (!mounted) return <div aria-hidden />;

  if (dismissed) {
    return (
      <div aria-hidden>
        <button
          onClick={reabrir}
          title="Trocar o layout do sistema"
          className="fixed font-mono text-[9px] tracking-widest uppercase transition-opacity"
          style={{
            bottom: 10,
            right: 10,
            padding: '4px 8px',
            border: '1px solid var(--rule)',
            background: 'var(--panel)',
            color: 'var(--ink-3)',
            borderRadius: 2,
            cursor: 'pointer',
            opacity: 0.35,
            zIndex: 50
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}
        >
          layout: {current}
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full"
      style={{
        borderBottom: '1px solid var(--rule)',
        background: 'linear-gradient(180deg, rgba(166,119,53,0.10), rgba(166,119,53,0.03))'
      }}
    >
      <div className="max-w-[1200px] mx-auto flex items-start justify-between gap-4 py-2.5 px-5 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--brass)' }}>
            Escolha o layout do sistema
          </span>
          <span className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
            Aplica em todas as telas. Após escolher, clique em <b>Fixar este</b> — o seletor some.
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {LAYOUTS.map(l => {
            const active = l.key === current;
            return (
              <button
                key={l.key}
                onClick={() => pick(l.key)}
                title={l.hint}
                className="text-left transition-all"
                style={{
                  padding: '5px 10px',
                  borderRadius: 3,
                  background: active ? 'var(--panel)' : 'transparent',
                  border: active ? '1px solid var(--brass)' : '1px solid var(--rule)',
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  minWidth: 96
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="inline-block rounded-full"
                        style={{ width: 7, height: 7, background: active ? 'var(--brass)' : 'var(--rule-strong)' }} />
                  <span className="text-[12.5px] font-medium" style={{ color: 'var(--ink)' }}>
                    {l.label}
                  </span>
                </div>
                <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--ink-3)', maxWidth: 200 }}>
                  {l.hint}
                </div>
              </button>
            );
          })}
          <button onClick={confirmar} className="btn btn-brass btn-sm" style={{ marginLeft: 4 }}>
            Fixar este ✓
          </button>
        </div>
      </div>
    </div>
  );
}
