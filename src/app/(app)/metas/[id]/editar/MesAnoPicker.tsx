'use client';

import { useState } from 'react';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// Janela de anos: 2 pra trás, 8 pra frente do ano corrente.
function anosDisponiveis(): number[] {
  const y = new Date().getFullYear();
  const arr: number[] = [];
  for (let i = y - 2; i <= y + 8; i++) arr.push(i);
  return arr;
}

function parseMesAno(v?: string | null): { mes: string; ano: string } {
  if (!v) return { mes: '', ano: '' };
  const m = String(v).trim().match(/^(\d{4})-(\d{2})/);
  if (!m) return { mes: '', ano: '' };
  return { ano: m[1], mes: m[2] };
}

// Dois dropdowns (mês + ano) que submetem UM valor "YYYY-MM" no name do form.
// Escolha "livre": se um dos dois não estiver preenchido, o valor final é "" —
// isso mantém o campo opcional sem quebrar a validação do server.
export function MesAnoPicker({
  name,
  defaultValue,
  label
}: {
  name: string;
  defaultValue?: string | null;
  label?: string;
}) {
  const inicial = parseMesAno(defaultValue);
  const [mes, setMes] = useState(inicial.mes);
  const [ano, setAno] = useState(inicial.ano);
  const anos = anosDisponiveis();
  const valorFinal = mes && ano ? `${ano}-${mes}` : '';

  return (
    <div className="flex gap-1.5" aria-label={label}>
      <select
        className="select"
        value={mes}
        onChange={e => setMes(e.target.value)}
        aria-label="Mês"
        style={{ flex: 1, minWidth: 0 }}
      >
        <option value="">Mês…</option>
        {MESES.map((nome, i) => (
          <option key={i} value={String(i + 1).padStart(2, '0')}>{nome}</option>
        ))}
      </select>
      <select
        className="select"
        value={ano}
        onChange={e => setAno(e.target.value)}
        aria-label="Ano"
        style={{ flex: '0 0 92px' }}
      >
        <option value="">Ano…</option>
        {anos.map(y => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
      <input type="hidden" name={name} value={valorFinal} />
    </div>
  );
}
