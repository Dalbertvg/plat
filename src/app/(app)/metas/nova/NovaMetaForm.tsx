'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { criarMetaCP } from '@/actions/metas';

type Sec = { id: string; nome: string };
type Div = { id: string; nome: string; secretariaId: string };
type MetaLP = { id: string; capitulo: string; titulo: string };

export function NovaMetaForm({
  metasLP,
  podeCriar,
  divisoes,
  secretarias,
  secDefault,
  podeMarcarPrincipal
}: {
  metasLP: MetaLP[];
  podeCriar: Sec[];
  divisoes: Div[];
  secretarias: Sec[];
  secDefault: string;
  podeMarcarPrincipal: boolean;
}) {
  const [secretariaDonaId, setSecretariaDonaId] = useState(secDefault);

  // Filtra apenas as divisões da secretaria selecionada.
  const divisoesElegiveis = useMemo(
    () => divisoes.filter(d => d.secretariaId === secretariaDonaId),
    [divisoes, secretariaDonaId]
  );

  return (
    <form action={criarMetaCP}>
      <div className="field">
        <label className="field-lbl">Capítulo do plano de governo (Meta LP)</label>
        <select name="metaLPId" className="select" required defaultValue="">
          <option value="" disabled>Selecione…</option>
          {metasLP.map(m => (
            <option key={m.id} value={m.id}>
              Cap {m.capitulo} · {m.titulo}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-lbl">Secretaria dona</label>
        <select
          name="secretariaDonaId"
          className="select"
          required
          value={secretariaDonaId}
          onChange={e => setSecretariaDonaId(e.target.value)}
        >
          {podeCriar.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      <div className="field">
        <label className="field-lbl">Divisão executora</label>
        <select name="divisaoExecutoraId" className="select" required defaultValue="" key={secretariaDonaId}>
          <option value="" disabled>Selecione…</option>
          {divisoesElegiveis.map(d => (
            <option key={d.id} value={d.id}>{d.nome}</option>
          ))}
        </select>
        <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
          Só divisões da secretaria dona são listadas.
          {divisoesElegiveis.length === 0 && ' (nenhuma divisão cadastrada para esta secretaria)'}
        </div>
      </div>

      <div className="field">
        <label className="field-lbl">Título / nome da meta</label>
        <input name="nome" className="input" required minLength={3} placeholder="Ex.: Ampliar cobertura da atenção primária em 30 %" />
      </div>

      {podeMarcarPrincipal && (
        <div className="field">
          <label className="field-lbl">Tipo da meta</label>
          <select name="tipo" className="select" defaultValue="secundaria">
            <option value="principal">Principal · compromisso do plano de governo</option>
            <option value="secundaria">Secundária · surgida depois, complementar</option>
          </select>
        </div>
      )}

      <div className="field">
        <label className="field-lbl">Secretarias participantes (opcional)</label>
        <div className="grid grid-cols-2 gap-1.5" style={{ padding: 8, background: 'var(--paper-3)', borderRadius: 3, border: '1px solid var(--rule)', maxHeight: 220, overflowY: 'auto' }}>
          {secretarias.filter(s => s.id !== secretariaDonaId).map(s => (
            <label key={s.id} className="flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
              <input type="checkbox" name="participantes" value={s.id} />
              {s.nome}
            </label>
          ))}
        </div>
        <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
          A secretaria dona é adicionada automaticamente.
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Link href="/metas" className="btn btn-ghost">Cancelar</Link>
        <button type="submit" className="btn btn-primary">Criar meta</button>
      </div>
    </form>
  );
}
