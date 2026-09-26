// Temas de cores da plataforma. A paleta de cada um está em globals.css,
// ativada pelo atributo data-theme no <html>. O escolhido fica salvo no
// usuário (Usuario.tema) e o servidor já entrega a página com ele — sem
// "piscar" o tema errado ao abrir. Arquivo usado no servidor e no navegador.

export const TEMAS = [
  {
    key: 'azul',
    label: 'Azul Cubic',
    hint: 'Claro, institucional',
    // amostra: fundo · barra superior · destaque
    cores: ['#F4F6F9', '#16265C', '#EF7F28']
  },
  {
    key: 'turquesa',
    label: 'Turquesa',
    hint: 'Claro, verde-azulado da marca',
    cores: ['#F4F6F9', '#0B4B4C', '#EF7F28']
  },
  {
    key: 'classico',
    label: 'Clássico',
    hint: 'Papel e serifas; claro ou escuro conforme o aparelho',
    cores: ['#F6F2EA', '#0F2A44', '#A67735']
  },
  {
    key: 'petroleo',
    label: 'Petróleo',
    hint: 'Escuro, azul profundo',
    cores: ['#081422', '#16265C', '#3FC7C0']
  },
  {
    key: 'marrom',
    label: 'Marrom',
    hint: 'Escuro, tons quentes',
    cores: ['#14100C', '#6B4226', '#D4A56E']
  }
] as const;

export type Tema = (typeof TEMAS)[number]['key'];

// Tema de quem ainda não escolheu (e da tela de login).
export const TEMA_PADRAO: Tema = 'azul';

export function ehTema(v: unknown): v is Tema {
  return typeof v === 'string' && TEMAS.some(t => t.key === v);
}

export function temaEfetivo(v: string | null | undefined): Tema {
  return ehTema(v) ? v : TEMA_PADRAO;
}

// "classico" não usa data-theme: segue o claro/escuro do sistema (ver globals.css).
export function atributoDoTema(t: Tema): string | undefined {
  return t === 'classico' ? undefined : t;
}
