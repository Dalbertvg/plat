'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut, LimiteDeTentativas } from '@/auth';

export type EstadoLogin = { erro?: string; email?: string };

const EntrarSchema = z.object({
  email: z.string().trim().max(254),
  senha: z.string().max(128),
  callbackUrl: z.string().max(512).optional()
});

// Só caminhos internos: bloqueia open redirect (//evil.com, /\evil.com, https://…).
function destinoSeguro(url?: string): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return '/painel';
  if (url === '/login' || url.startsWith('/login?')) return '/painel';
  return url;
}

export async function entrar(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const parsed = EntrarSchema.safeParse({
    email: formData.get('email') ?? '',
    senha: formData.get('senha') ?? '',
    callbackUrl: formData.get('callbackUrl') || undefined
  });
  if (!parsed.success) return { erro: 'E-mail ou senha inválidos.' };
  const { email, senha, callbackUrl } = parsed.data;

  try {
    await signIn('credentials', { email, senha, redirectTo: destinoSeguro(callbackUrl) });
    return {};
  } catch (erro) {
    if (erro instanceof LimiteDeTentativas) {
      return { erro: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.', email };
    }
    // Mesma mensagem para e-mail inexistente, conta inativa e senha errada.
    if (erro instanceof AuthError) return { erro: 'E-mail ou senha inválidos.', email };
    throw erro; // inclui o NEXT_REDIRECT do login bem-sucedido
  }
}

export async function sair() {
  await signOut({ redirectTo: '/login' });
}
