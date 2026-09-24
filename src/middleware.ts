import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

// Negar por padrão: tudo exige sessão, exceto esta lista explícita.
const ROTAS_PUBLICAS = new Set(['/login']);
const PREFIXOS_PUBLICOS = ['/api/auth/']; // CSRF, callback e signout do próprio Auth.js

function ehPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.has(pathname) || PREFIXOS_PUBLICOS.some(p => pathname.startsWith(p));
}

// Primeira barreira apenas: valida a assinatura/validade do JWT no Edge, sem
// banco. Páginas e Server Actions revalidam a sessão contra o banco via
// getCurrentUser() (usuário ativo + sessaoVersao) — nunca confie só nisto.
export default auth(req => {
  const { pathname, search } = req.nextUrl;

  if (ehPublica(pathname) || req.auth?.user) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }

  const login = new URL('/login', req.nextUrl.origin);
  if (pathname !== '/') login.searchParams.set('callbackUrl', pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  // Só ficam de fora os assets estáticos (incluindo o logo usado na tela de login).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo/).*)']
};
