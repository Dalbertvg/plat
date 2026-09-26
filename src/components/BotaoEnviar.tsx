'use client';

import { useFormStatus } from 'react-dom';

// Botão de envio para formulários com Server Action: enquanto o servidor
// processa, fica desabilitado e troca o texto — o usuário vê que o clique foi
// recebido e não envia duas vezes.
export function BotaoEnviar({
  children,
  enviando = 'Enviando…',
  className = 'btn btn-primary btn-sm',
  style,
  desabilitado = false
}: {
  children: React.ReactNode;
  enviando?: string;
  className?: string;
  style?: React.CSSProperties;
  desabilitado?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      style={{ ...style, ...(pending ? { opacity: 0.7, cursor: 'progress' } : null) }}
      disabled={pending || desabilitado}
      aria-busy={pending}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="girando" aria-hidden />
          {enviando}
        </span>
      ) : children}
    </button>
  );
}
