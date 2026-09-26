'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { TEMAS, TEMA_PADRAO, atributoDoTema, type Tema } from '@/lib/temas';
import { salvarTema } from '@/actions/preferencias';

// Evento que mantém em sincronia as duas cópias do seletor (barra lateral e
// menu em gaveta do celular), que ficam em pontos diferentes da página.
const EVENTO_TEMA = 'app:tema-alterado';

function aplicarNaPagina(t: Tema) {
  const attr = atributoDoTema(t);
  if (attr) document.documentElement.setAttribute('data-theme', attr);
  else document.documentElement.removeAttribute('data-theme');
}

// Área "Aparência" do menu. Recolhida: uma linha "Tema · <nome>". Aberta: uma
// fileira de amostras de cor. A troca vale na hora e é gravada no usuário —
// acompanha o login em qualquer computador ou celular.
export function SeletorTema({ temaInicial }: { temaInicial: Tema }) {
  const [tema, setTema] = useState<Tema>(temaInicial);
  const [aberto, setAberto] = useState(false);
  const [emFoco, setEmFoco] = useState<Tema | null>(null);
  const [aviso, setAviso] = useState<'salvo' | 'erro' | null>(null);
  const [salvando, startSalvar] = useTransition();
  const idPainel = useId();

  useEffect(() => {
    const sincronizar = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener(EVENTO_TEMA, sincronizar);
    return () => window.removeEventListener(EVENTO_TEMA, sincronizar);
  }, []);

  useEffect(() => {
    if (aviso !== 'salvo') return;
    const t = setTimeout(() => setAviso(null), 2000);
    return () => clearTimeout(t);
  }, [aviso]);

  const trocarPara = (novo: Tema) => {
    if (novo === tema || salvando) return;
    const anterior = tema;
    const aplicar = (t: Tema) => {
      aplicarNaPagina(t);
      window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: t }));
    };
    aplicar(novo);
    setAviso(null);
    startSalvar(async () => {
      try {
        const r = await salvarTema(novo);
        if (r.ok) { setAviso('salvo'); return; }
      } catch { /* cai no desfazer abaixo */ }
      aplicar(anterior);
      setAviso('erro');
    });
  };

  const atual = TEMAS.find(t => t.key === tema) ?? TEMAS[0];
  // Nome exibido sob as amostras: o que está sob o mouse/foco, senão o atual.
  const mostrado = TEMAS.find(t => t.key === emFoco) ?? atual;

  return (
    <div className="pb-1">
      <div className="px-5 pt-3 pb-2 font-mono text-[11.5px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>
        Aparência
      </div>

      <button
        type="button"
        className="w-full flex items-center gap-3 px-5 py-2.5 text-[16px] text-left border-l-2 hover:opacity-80"
        style={{ color: 'var(--ink-2)', borderLeftColor: 'transparent' }}
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto(v => !v)}
      >
        <Amostra cores={atual.cores} tamanho={16} />
        <span className="flex-1">Tema</span>
        <span className="text-[13px] truncate" style={{ color: 'var(--ink-3)' }}>{atual.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"
             style={{ color: 'var(--ink-3)', flex: 'none', transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>

      {/* Renderizado só quando aberto: nada escondido por CSS que possa "vazar". */}
      {aberto && (
        <div id={idPainel} className="px-5 pb-2" onMouseLeave={() => setEmFoco(null)}>
          <div role="radiogroup" aria-label="Tema de cores" className="flex items-center gap-1.5 pt-1">
            {TEMAS.map(t => {
              const ativo = t.key === tema;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  aria-label={t.key === TEMA_PADRAO ? `${t.label} (padrão)` : t.label}
                  title={t.label}
                  onClick={() => trocarPara(t.key)}
                  onMouseEnter={() => setEmFoco(t.key)}
                  onFocus={() => setEmFoco(t.key)}
                  onBlur={() => setEmFoco(null)}
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 32, height: 32, flex: 'none',
                    border: `2px solid ${ativo ? 'var(--brass)' : 'transparent'}`,
                    cursor: salvando ? 'progress' : 'pointer'
                  }}
                >
                  <Amostra cores={t.cores} tamanho={24} />
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--ink-3)' }}>
            <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{mostrado.label}</span>
            {' · '}{mostrado.hint}{mostrado.key === TEMA_PADRAO && ' (padrão)'}
          </div>
          <div aria-live="polite" className="text-[12px] mt-0.5" style={{ minHeight: '1.1em', color: aviso === 'erro' ? 'var(--late)' : 'var(--ok)' }}>
            {salvando ? <span style={{ color: 'var(--ink-3)' }}>Salvando…</span>
              : aviso === 'salvo' ? '✓ Salvo no seu login'
              : aviso === 'erro' ? 'Não foi possível salvar.'
              : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// Amostra redonda da paleta: fundo, barra superior e destaque.
function Amostra({ cores, tamanho }: { cores: readonly string[]; tamanho: number }) {
  const [fundo, superficie, destaque] = cores;
  return (
    <span
      aria-hidden
      className="inline-block rounded-full flex-none"
      style={{
        width: tamanho,
        height: tamanho,
        background: `conic-gradient(from 225deg, ${fundo} 0 50%, ${superficie} 50% 80%, ${destaque} 80% 100%)`,
        boxShadow: 'inset 0 0 0 1px var(--rule-strong)'
      }}
    />
  );
}
