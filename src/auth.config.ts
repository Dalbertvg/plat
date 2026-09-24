import type { NextAuthConfig } from 'next-auth';

// Parte da configuração que roda no Edge Runtime (middleware): sem Prisma, sem
// bcrypt, sem Node APIs. O provider de credenciais é adicionado em src/auth.ts.
export const authConfig = {
  pages: { signIn: '/login' },
  session: {
    strategy: 'jwt',
    // Expira após 8h sem uso (o cookie é renovado a cada requisição).
    maxAge: 8 * 60 * 60
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessaoVersao = user.sessaoVersao;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.sessaoVersao = token.sessaoVersao;
      return session;
    }
  }
} satisfies NextAuthConfig;
