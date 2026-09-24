/**
 * Redefine a senha de um usuário (não existe recuperação self-service).
 *
 *   npm run usuario:senha -- fulano@uba.mg.gov.br
 *
 * Gera uma senha aleatória, grava só o hash, derruba todas as sessões ativas
 * do usuário (sessaoVersao + 1) e imprime a nova senha uma única vez.
 * Deve ser executado apenas por quem tem acesso ao servidor/banco.
 */
import { PrismaClient } from '@prisma/client';
import { gerarSenhaInicial, hashSenha } from '../src/lib/senha';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Uso: npm run usuario:senha -- <email>');
    process.exit(1);
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) {
    console.error(`Nenhum usuário com o e-mail ${email}.`);
    process.exit(1);
  }

  const senha = gerarSenhaInicial();
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await hashSenha(senha), sessaoVersao: { increment: 1 } }
  });

  console.log(`Senha redefinida para ${usuario.nome} <${email}>. Sessões anteriores encerradas.`);
  console.log(`Nova senha (exibida uma única vez): ${senha}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
