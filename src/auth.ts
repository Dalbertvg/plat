import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/db';
import { verificarSenha, simularVerificacao } from '@/lib/senha';
import { consumirLimite, zerarLimite, ipDoCliente, LIMITES } from '@/lib/rate-limit';

export class LimiteDeTentativas extends CredentialsSignin {
  code = 'limite_tentativas';
}

const CredenciaisSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  senha: z.string().min(1).max(128)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, senha: {} },
      // O rate limit mora aqui (e não só na server action de login) porque
      // este callback também é alcançável direto por POST em
      // /api/auth/callback/credentials.
      async authorize(credenciais, request) {
        const parsed = CredenciaisSchema.safeParse(credenciais);
        if (!parsed.success) return null;
        const { email, senha } = parsed.data;

        const ip = ipDoCliente(request.headers);
        const chaveEmail = `login:email:${email}`;
        const [porIp, porEmail] = await Promise.all([
          consumirLimite(`login:ip:${ip}`, LIMITES.loginPorIp),
          consumirLimite(chaveEmail, LIMITES.loginPorEmail)
        ]);
        if (!porIp.ok || !porEmail.ok) throw new LimiteDeTentativas();

        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario || !usuario.ativo) {
          await simularVerificacao(senha);
          return null;
        }
        if (!(await verificarSenha(senha, usuario.senhaHash))) return null;

        await zerarLimite(chaveEmail);
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcesso: new Date() }
        });

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          sessaoVersao: usuario.sessaoVersao
        };
      }
    })
  ],
  logger: {
    // Falha de credencial é esperada; registra uma linha em vez de stack trace.
    error(erro) {
      if (erro instanceof CredentialsSignin) {
        console.warn(`[auth] login recusado (${erro.code})`);
        return;
      }
      console.error('[auth]', erro);
    }
  }
});
