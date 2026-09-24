export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export function fmtMesAno(d: Date | null | undefined): string {
  if (!d) return '—';
  return `${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}

// Peso derivado do "tempo necessário" (mesmo mapeamento da planilha, coluna S).
// `mesesMax` é o teto de meses da faixa e é usado para computar o prazo final
// da ação (inicio + mesesMax) — a partir dele definimos "em atraso" no painel.
export const TEMPO_OPCOES = [
  { value: 'ate_6m',     label: 'Até 6 meses',       peso: 6,  mesesMax: 6  },
  { value: '7_12m',      label: '7 a 12 meses',      peso: 12, mesesMax: 12 },
  { value: '13_24m',     label: '13 a 24 meses',     peso: 24, mesesMax: 24 },
  { value: '25_36m',     label: '25 a 36 meses',     peso: 36, mesesMax: 36 },
  { value: 'acima_36m',  label: 'Acima de 36 meses', peso: 48, mesesMax: 48 }
] as const;

// Meses máximos que aquela faixa de "tempo necessário" comporta.
export function mesesMaxDeTempo(tempo?: string | null): number | null {
  if (!tempo) return null;
  const o = TEMPO_OPCOES.find(t => t.value === tempo);
  return o ? o.mesesMax : null;
}

// Parse permissivo de "YYYY-MM" / "YYYY-MM-DD" / ISO para Date no 1o dia do mês.
export function parseMesInicio(s?: string | null): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/^(\d{4})-(\d{2})/);
  if (!m) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

// Data-limite derivada: inicio + mesesMax(tempo). Retorna o ÚLTIMO dia do mês
// alvo, para o "em atraso" só disparar depois do mês terminar.
export function calcPrazoFinal(inicio?: string | null, tempo?: string | null): Date | null {
  const ini = parseMesInicio(inicio);
  const meses = mesesMaxDeTempo(tempo);
  if (!ini || meses == null) return null;
  // último dia do mês final
  return new Date(ini.getFullYear(), ini.getMonth() + meses + 1, 0);
}

// Prazo final da META = o prazo mais distante entre as ações vinculadas
// (a meta só termina quando a última ação termina). Ações sem início ou tempo
// necessário definidos não entram no cálculo. Retorna null se nenhuma ação
// tiver prazo calculável.
export function calcPrazoMetaFinal(
  acoes: Array<{ inicio?: string | null; tempoNecessario?: string | null }>
): Date | null {
  let maisDistante: Date | null = null;
  for (const a of acoes) {
    const prazo = calcPrazoFinal(a.inicio, a.tempoNecessario);
    if (prazo && (!maisDistante || prazo > maisDistante)) maisDistante = prazo;
  }
  return maisDistante;
}

export type StatusAcaoDerivado = 'nao_iniciada' | 'andamento' | 'atraso' | 'concluida';

// Status derivado das datas — a regra do usuário:
//   - situação >= 99% (ou status manual "concluida") → concluída
//   - hoje < inicio                                 → não iniciada
//   - hoje > inicio + mesesMax(tempo)               → atraso
//   - senão                                         → andamento
export function computeStatusAcao(a: {
  inicio?: string | null;
  tempoNecessario?: string | null;
  situacaoAtual: number;
  status?: string | null;
}, hoje: Date = new Date()): StatusAcaoDerivado {
  if (a.status === 'concluida' || a.situacaoAtual >= 0.99) return 'concluida';
  const ini = parseMesInicio(a.inicio);
  const prazo = calcPrazoFinal(a.inicio, a.tempoNecessario);
  if (ini && hoje < ini) return 'nao_iniciada';
  if (prazo && hoje > prazo) return 'atraso';
  return 'andamento';
}

export function pesoDeTempo(tempo?: string | null): number {
  if (!tempo) return 1;
  const o = TEMPO_OPCOES.find(t => t.value === tempo);
  return o ? o.peso : 1;
}

export function labelDeTempo(tempo?: string | null): string {
  if (!tempo) return '—';
  return TEMPO_OPCOES.find(t => t.value === tempo)?.label ?? tempo;
}

// pctFromAcoes segue a fórmula da planilha (coluna V = U/T):
// - Se unidade é "%": contribuicao = situacaoAtual * peso
// - Senão:            contribuicao = (situacaoAtual / alvo) * peso
// Aqui, situacaoAtual já está normalizada em 0–1, então em ambos os casos
// a contribuição fica situacaoAtual * peso; a diferença de unidade só afeta
// a EXIBIÇÃO (com/sem símbolo).
export function pctFromAcoes(acoes: Array<{ situacaoAtual: number; peso: number }>): number {
  if (!acoes.length) return 0;
  const num = acoes.reduce((s, a) => s + a.situacaoAtual * a.peso, 0);
  const den = acoes.reduce((s, a) => s + a.peso, 0);
  return den ? num / den : 0;
}

// Formata o alvo com unidade legível.
export function fmtAlvo(alvo: number, unidade?: string | null): string {
  const u = (unidade ?? '').trim();
  if (!u) return String(alvo);
  if (u === '%') return `${alvo}%`;
  if (u === 'R$') return `R$ ${alvo.toLocaleString('pt-BR')}`;
  return `${alvo} ${u}`;
}
