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

// Área "Aparência" do menu: mostra o tema atual e, ao abrir, as opções. A
// troca vale na hora e é gravada no usuário — acompanha o login em qualquer
// computador ou celular.
export function SeletorTema({ temaInicial }: { temaInicial: Tema }) {
  const [tema, setTema] = useState<Tema>(temaInicial);
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<'salvo' | 'erro' | null>(null);
  const [salvando, startSalvar] = useTransition();
  const idLista = useId();

  useEffect(() => {
    const sincronizar = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener(EVENTO_TEMA, sincronizar);
    return () => window.removeEventListener(EVENTO_TEMA, sincronizar);
  }, []);

  useEffect(() => {
    if (aviso !== 'salvo') return;
    const t = setTimeout(() => setAviso(null), 2500);
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

  return (
    <div className="px-5 pt-3 pb-1">
      <div className="pb-1.5 font-mono text-[11.5px] tracking-widest uppercase" style={{ color: 'var(--ink-3)' }}>
        Aparência
      </div>
      <button
        type="button"
        className="w-full flex items-center gap-2.5 py-2 text-left text-[15px] hover:opacity-80"
        style={{ color: 'var(--ink-2)' }}
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => setAberto(v => !v)}
      >
        <Amostra cores={atual.cores} />
        <span className="flex-1 min-w-0 truncate">
          Tema: <b className="font-medium" style={{ color: 'var(--ink)' }}>{atual.label}</b>
        </span>
        <span aria-hidden className="text-[12px]" style={{ color: 'var(--ink-3)' }}>{aberto ? '▲' : '▼'}</span>
      </button>

      <div id={idLista} role="radiogroup" aria-label="Tema de cores" className="grid gap-1 pb-1" hidden={!aberto}>
        {TEMAS.map(t => {
          const ativo = t.key === tema;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => trocarPara(t.key)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded text-left"
              style={{
                background: ativo ? 'rgba(166,119,53,0.12)' : 'transparent',
                border: `1px solid ${ativo ? 'var(--brass)' : 'transparent'}`,
                cursor: salvando ? 'progress' : 'pointer'
              }}
            >
              <Amostra cores={t.cores} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-medium leading-tight" style={{ color: 'var(--ink)' }}>
                  {t.label}
                </span>
                <span className="block text-[11.5px] leading-snug mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {t.hint}{t.key === TEMA_PADRAO && ' · padrão'}
                </span>
              </span>
              {ativo && <span aria-hidden className="text-[13px]" style={{ color: 'var(--brass)' }}>✓</span>}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="text-[11.5px] leading-snug" style={{ minHeight: '1.2em', color: aviso === 'erro' ? 'var(--late)' : 'var(--ok)' }}>
        {salvando ? <span style={{ color: 'var(--ink-3)' }}>Salvando…</span>
          : aviso === 'salvo' ? '✓ Salvo no seu login'
          : aviso === 'erro' ? 'Não foi possível salvar. Tente de novo.'
          : ''}
      </div>
    </div>
  );
}

// Amostra da paleta: fundo · barra superior · destaque.
function Amostra({ cores }: { cores: readonly string[] }) {
  return (
    <span
      aria-hidden
      className="inline-flex overflow-hidden rounded-sm flex-none"
      style={{ width: 30, height: 18, border: '1px solid var(--rule-strong)' }}
    >
      {cores.map((c, i) => <span key={i} style={{ flex: i === 0 ? 1.4 : 1, background: c }} />)}
    </span>
  );
}
