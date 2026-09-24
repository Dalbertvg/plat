'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { submeterProposta } from '@/actions/propostas';

type Sec = { id: string; nome: string };
type Div = { id: string; nome: string; secretariaId: string };
type MetaCP = { id: string; nome: string; secretariaDonaId: string };
type Lot = { secretariaId: string; divisaoId: string | null };

export function NovaPropostaForm({
  visiveis,
  divisoes,
  metasCP,
  lotacoesUser,
  perfil,
  revisorHint,
  metaContexto
}: {
  visiveis: Sec[];
  divisoes: Div[];
  metasCP: MetaCP[];
  lotacoesUser: Lot[];
  perfil: string;
  revisorHint: string;
  metaContexto?: { id: string; nome: string; secretariaDonaId: string } | null;
}) {
  // Se veio de uma meta específica, força tipo=edicao e trava a meta alvo.
  const [tipo, setTipo] = useState<'nova' | 'edicao' | 'ajuste_acao'>(
    metaContexto ? 'edicao' : 'nova'
  );
  const [secretariaDonaId, setSecretariaDonaId] = useState(
    metaContexto?.secretariaDonaId ?? (visiveis[0]?.id ?? '')
  );
  const travadoPelaMeta = !!metaContexto;

  // Divisões possíveis para a proposta:
  //  - Se o autor tem lotação na secretaria alvo, mostra só as divisões DELE naquela secretaria.
  //  - Senão (secretário propondo para outra pasta), mostra todas as divisões da secretaria alvo.
  const divisoesElegiveis = useMemo(() => {
    const divsDoUsuarioNaSec = lotacoesUser
      .filter(l => l.secretariaId === secretariaDonaId && l.divisaoId)
      .map(l => l.divisaoId!);
    if (divsDoUsuarioNaSec.length > 0) {
      return divisoes.filter(d => divsDoUsuarioNaSec.includes(d.id));
    }
    return divisoes.filter(d => d.secretariaId === secretariaDonaId);
  }, [divisoes, secretariaDonaId, lotacoesUser]);

  // Metas existentes da secretaria selecionada (para edição/ajuste).
  const metasElegiveis = useMemo(
    () => metasCP.filter(m => m.secretariaDonaId === secretariaDonaId),
    [metasCP, secretariaDonaId]
  );

  const precisaMetaAlvo = tipo === 'edicao' || tipo === 'ajuste_acao';

  return (
    <form action={submeterProposta}>
      {travadoPelaMeta && metaContexto && (
        <div
          className="mb-4 p-3 border-l-4"
          style={{ background: 'rgba(166,119,53,0.08)', borderColor: 'var(--brass)' }}
        >
          <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--brass)' }}>
            Você está propondo edição para
          </div>
          <div className="font-medium mt-1" style={{ color: 'var(--ink)' }}>
            {metaContexto.id} · {metaContexto.nome}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Só descreva a mudança desejada abaixo — o alvo já está definido.
          </div>
          {/* Campos escondidos para o server action */}
          <input type="hidden" name="tipo" value="edicao" />
          <input type="hidden" name="secretariaDonaId" value={metaContexto.secretariaDonaId} />
          <input type="hidden" name="metaCPRefId" value={metaContexto.id} />
        </div>
      )}

      {!travadoPelaMeta && (
        <>
          <div className="field">
            <label className="field-lbl">Tipo</label>
            <select
              name="tipo"
              className="select"
              required
              value={tipo}
              onChange={e => setTipo(e.target.value as typeof tipo)}
            >
              <option value="nova">Sugerir nova meta</option>
              <option value="edicao">Editar meta existente</option>
              <option value="ajuste_acao">Ajustar ação (alvo, prazo, responsável)</option>
            </select>
          </div>

          <div className="field">
            <label className="field-lbl">Secretaria alvo</label>
            <select
              name="secretariaDonaId"
              className="select"
              required
              value={secretariaDonaId}
              onChange={e => setSecretariaDonaId(e.target.value)}
            >
              {visiveis.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            {perfil === 'secretario' && !lotacoesUser.some(l => l.secretariaId === secretariaDonaId) && (
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--brass)' }}>
                Você está propondo para uma secretaria da qual não é dono — a proposta será
                encaminhada ao secretário responsável primeiro.
              </div>
            )}
          </div>

          {precisaMetaAlvo && (
            <div className="field">
              <label className="field-lbl">Meta alvo</label>
              <select name="metaCPRefId" className="select" required defaultValue="" key={secretariaDonaId}>
                <option value="" disabled>Selecione a meta…</option>
                {metasElegiveis.map(m => (
                  <option key={m.id} value={m.id}>{m.id} · {m.nome}</option>
                ))}
              </select>
              {metasElegiveis.length === 0 && (
                <div className="text-[11.5px] mt-1" style={{ color: 'var(--danger, #c33)' }}>
                  Nenhuma meta cadastrada nessa secretaria ainda.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {divisoesElegiveis.length > 0 && (
        <div className="field">
          <label className="field-lbl">Divisão de origem</label>
          <select name="divisaoOrigemId" className="select" key={secretariaDonaId} defaultValue="">
            <option value="">— sem divisão específica —</option>
            {divisoesElegiveis.map(d => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </select>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Só divisões da secretaria alvo são listadas.
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-lbl">Título</label>
        <input name="titulo" className="input" required minLength={3} placeholder="Ex.: Ampliar horário dos CRAS aos sábados" />
      </div>

      <div className="field">
        <label className="field-lbl">
          Descrição / justificativa <span style={{ color: 'var(--danger, #c33)' }}>*</span>
        </label>
        <textarea
          name="descricao"
          className="textarea"
          required
          minLength={3}
          placeholder="Contexto, quem se beneficia, custo estimado se souber… (obrigatório)"
        />
      </div>

      <div className="text-[11.5px] mb-2" style={{ color: 'var(--ink-3)' }}>
        Próximo revisor: <b>{revisorHint}</b>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Link href="/propostas" className="btn btn-ghost">Cancelar</Link>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!travadoPelaMeta && precisaMetaAlvo && metasElegiveis.length === 0}
        >
          {travadoPelaMeta ? 'Enviar proposta de edição' : 'Enviar proposta'}
        </button>
      </div>
    </form>
  );
}
