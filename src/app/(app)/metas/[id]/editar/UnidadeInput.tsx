'use client';

import { useState } from 'react';

// Opções nativas do sistema. "Outro…" é um marcador especial que revela um input
// de texto livre, e o valor submetido (name="unidade") vira o que a pessoa digitar.
const OPCOES_PADRAO = ['%', 'un', 'R$', 'h', 'dias', 'meses', 'pessoas', 'km'] as const;
const OUTRO = '__outro__';

export function UnidadeInput({
  name = 'unidade',
  defaultValue,
  placeholder = 'un'
}: {
  name?: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const initial = (defaultValue ?? '').trim();
  const isPredefined = OPCOES_PADRAO.includes(initial as (typeof OPCOES_PADRAO)[number]);
  const [modo, setModo] = useState<string>(initial === '' ? '' : isPredefined ? initial : OUTRO);
  const [textoLivre, setTextoLivre] = useState<string>(isPredefined ? '' : initial);

  // O valor real enviado ao servidor: sempre em um único input hidden com o nome final.
  const valorFinal = modo === OUTRO ? textoLivre.trim() : modo;

  return (
    <div className="flex gap-1.5 items-stretch" style={{ flex: 1, minWidth: 0 }}>
      <select
        className="select"
        value={modo}
        onChange={e => setModo(e.target.value)}
        style={{ flex: modo === OUTRO ? '0 0 96px' : 1, minWidth: 0 }}
      >
        <option value="">— sem unidade —</option>
        {OPCOES_PADRAO.map(u => (
          <option key={u} value={u}>{u}</option>
        ))}
        <option value={OUTRO}>Outro…</option>
      </select>

      {modo === OUTRO && (
        <input
          type="text"
          className="input"
          autoFocus
          value={textoLivre}
          onChange={e => setTextoLivre(e.target.value)}
          placeholder="ex.: tCO₂, litros, alunos…"
          maxLength={20}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Digite a unidade personalizada"
        />
      )}

      {/* Input escondido com o valor final — é o que a action recebe. */}
      <input type="hidden" name={name} value={valorFinal} />
    </div>
  );
}
