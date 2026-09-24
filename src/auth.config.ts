import type { NextAuthConfig } from 'next-auth';

// Parte da configuração que roda no Edge Runtime (middleware): sem Prisma, sem
// bcrypt, sem Node APIs. O provider de credenciais é adicionado em src/auth.ts.
export const authConfig = {
  // No Render (que sempre define RENDER=true) o app só é alcançável pelo proxy
  // dele, que informa host e protocolo corretos. Fora dele vale o padrão do
  // Auth.js: AUTH_URL ou AUTH_TRUST_HOST=true.
  trustHost: process.env.RENDER === 'true' ? true : undefined,
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
