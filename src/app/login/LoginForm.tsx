'use client';

import { useActionState } from 'react';
import { entrar, type EstadoLogin } from '@/actions/auth';

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao}>
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ''} />

      <div className="field">
        <label className="field-lbl" htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          required
          autoComplete="username"
          autoFocus
          maxLength={254}
          defaultValue={estado.email}
          key={estado.email}
        />
      </div>

      <div className="field">
        <label className="field-lbl" htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          className="input"
          required
          autoComplete="current-password"
          maxLength={128}
        />
      </div>

      {estado.erro && (
        <div
          role="alert"
          className="text-[13.5px] mb-3 p-2.5 border-l-4"
          style={{ background: 'rgba(176,69,48,0.08)', borderColor: 'var(--late)', color: 'var(--late)' }}
        >
          {estado.erro}
        </div>
      )}

      <button type="submit" className="btn btn-primary w-full justify-center" disabled={pendente}>
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
