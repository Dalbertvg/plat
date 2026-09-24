import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    sessaoVersao: number;
  }
  interface Session {
    user: {
      id: string;
      sessaoVersao: number;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    sessaoVersao: number;
  }
}
