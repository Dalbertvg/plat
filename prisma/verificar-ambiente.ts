/**
 * Primeiro passo do `npm run start` (produção). Mostra no log quais variáveis
 * de ambiente existem — nunca os valores — e aborta o start com mensagem
 * clara se faltar algo essencial. Sem isto, o erro só aparece como
 * "There was a problem with the server configuration" na hora do login.
 */
const presente = (nome: string) => (process.env[nome] ?? '').trim().length > 0;

const faltando: string[] = [];
if (!presente('DATABASE_URL')) {
  faltando.push('DATABASE_URL — a "Internal Database URL" do Postgres');
}
if ((process.env.AUTH_SECRET ?? '').trim().length < 32) {
  faltando.push('AUTH_SECRET — um valor aleatório com 32 caracteres ou mais');
}
const hostConfiavel = process.env.RENDER === 'true' || presente('AUTH_URL') || process.env.AUTH_TRUST_HOST === 'true';
if (!hostConfiavel) {
  faltando.push('AUTH_URL (endereço público https do site) ou AUTH_TRUST_HOST=true');
}

const estado = (ok: boolean) => (ok ? 'ok' : 'FALTANDO');
console.log(
  `[config] RENDER=${process.env.RENDER ?? '(não definido)'} | ` +
  `DATABASE_URL ${estado(presente('DATABASE_URL'))} | ` +
  `AUTH_SECRET ${estado((process.env.AUTH_SECRET ?? '').trim().length >= 32)} | ` +
  `SENHA_INICIAL_ADMIN ${presente('SENHA_INICIAL_ADMIN') ? 'definida' : 'não definida'}`
);

if (faltando.length) {
  console.error('[config] Start cancelado. Cadastre em Environment (painel do Render) e faça um novo deploy:');
  for (const f of faltando) console.error(`[config]   - ${f}`);
  process.exit(1);
}
