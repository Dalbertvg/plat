// Sem `import 'server-only'` de propósito: os scripts de linha de comando
// (prisma/seed.ts, prisma/definir-senha.ts) reutilizam este módulo fora do Next.
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

const CUSTO_BCRYPT = 12;

// bcrypt ignora tudo além de 72 bytes — senhas novas acima disso são recusadas
// em vez de silenciosamente truncadas.
export const SENHA_MAX_BYTES = 72;

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// Quando o e-mail não existe, gasta o mesmo tempo de uma verificação real para
// que o tempo de resposta não revele quais e-mails têm conta.
let hashDeReferencia: Promise<string> | null = null;
export async function simularVerificacao(senha: string): Promise<void> {
  hashDeReferencia ??= bcrypt.hash('conta-inexistente', CUSTO_BCRYPT);
  await bcrypt.compare(senha, await hashDeReferencia);
}

// Sem caracteres ambíguos (0/O, 1/l/I) — a senha é ditada/copiada pelo admin.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function gerarSenhaInicial(tamanho = 16): string {
  let senha = '';
  for (let i = 0; i < tamanho; i++) senha += ALFABETO[randomInt(ALFABETO.length)];
  return senha;
}
