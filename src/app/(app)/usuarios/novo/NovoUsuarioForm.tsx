'use client';

import { useState, useMemo, useActionState } from 'react';
import Link from 'next/link';
import { criarUsuario, type EstadoCriarUsuario } from '@/actions/usuarios';

type Sec = { id: string; nome: string };
type Div = { id: string; nome: string; secretariaId: string };

export function NovoUsuarioForm({
  secretarias,
  divisoes,
  podeAtribuirQualquerCargo
}: {
  secretarias: Sec[];
  divisoes: Div[];
  podeAtribuirQualquerCargo: boolean;
}) {
  const [estado, acao, pendente] = useActionState<EstadoCriarUsuario, FormData>(criarUsuario, {});
  const [secretariaId, setSecretariaId] = useState(secretarias[0]?.id ?? '');

  // Filtra apenas as divisões da secretaria selecionada.
  const divisoesElegiveis = useMemo(
    () => divisoes.filter(d => d.secretariaId === secretariaId),
    [divisoes, secretariaId]
  );

  if (estado.ok) {
    return <CredencialCriada nome={estado.nome} email={estado.email} senha={estado.senhaInicial} />;
  }

  return (
    <form action={acao}>
      {estado.erro && (
        <div
          role="alert"
          className="text-[13.5px] mb-3 p-2.5 border-l-4"
          style={{ background: 'rgba(176,69,48,0.08)', borderColor: 'var(--late)', color: 'var(--late)' }}
        >
          {estado.erro}
        </div>
      )}

      <div className="field">
        <label className="field-lbl">Nome completo</label>
        <input name="nome" className="input" required minLength={3} maxLength={120} placeholder="Ex.: Maria da Silva" />
      </div>

      <div className="field">
        <label className="field-lbl">E-mail</label>
        <input name="email" type="email" className="input" required maxLength={254} placeholder="nome@uba.mg.gov.br" />
      </div>

      <div className="field">
        <label className="field-lbl">Cargo</label>
        <select name="perfil" className="select" required defaultValue="chefe">
          <option value="chefe">Chefe</option>
          {podeAtribuirQualquerCargo && <option value="secretario">Secretário</option>}
          {podeAtribuirQualquerCargo && <option value="prefeito">Prefeito</option>}
        </select>
        {!podeAtribuirQualquerCargo && (
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Secretários só podem cadastrar pessoas no cargo de chefe.
          </div>
        )}
      </div>

      <div className="field">
        <label className="field-lbl">Secretaria</label>
        <select
          name="secretariaId"
          className="select"
          required
          value={secretariaId}
          onChange={e => setSecretariaId(e.target.value)}
        >
          {secretarias.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      <div className="field">
        <label className="field-lbl">Divisão (opcional)</label>
        <select name="divisaoId" className="select" defaultValue="" key={secretariaId}>
          <option value="">Sem divisão</option>
          {divisoesElegiveis.map(d => (
            <option key={d.id} value={d.id}>{d.nome}</option>
          ))}
        </select>
        <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
          Só divisões da secretaria selecionada são listadas.
        </div>
      </div>

      <div className="text-[12px] mb-2" style={{ color: 'var(--ink-3)' }}>
        A senha inicial é gerada automaticamente e exibida uma única vez após o cadastro.
      </div>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Link href="/usuarios" className="btn btn-ghost">Cancelar</Link>
        <button type="submit" className="btn btn-primary" disabled={pendente}>
          {pendente ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </div>
    </form>
  );
}

function CredencialCriada({ nome, email, senha }: { nome: string; email: string; senha: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`E-mail: ${email}\nSenha: ${senha}`);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div>
      <div className="p-3 mb-4 border-l-4" style={{ background: 'rgba(47,125,92,0.08)', borderColor: 'var(--ok)' }}>
        <div className="font-medium" style={{ color: 'var(--ink)' }}>{nome} foi cadastrado(a).</div>
        <div className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>
          Entregue as credenciais abaixo por um canal seguro. <b>A senha não será exibida novamente</b> —
          se for perdida, será preciso redefini-la.
        </div>
      </div>

      <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: '80px 1fr' }}>
        <span className="field-lbl m-0">E-mail</span>
        <code className="text-[14px]">{email}</code>
        <span className="field-lbl m-0">Senha</span>
        <code className="text-[16px] font-semibold tracking-wider select-all">{senha}</code>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={copiar}>
          {copiado ? '✓ Copiado' : 'Copiar credenciais'}
        </button>
        <Link href="/usuarios" className="btn btn-primary">Concluir</Link>
      </div>
    </div>
  );
}
