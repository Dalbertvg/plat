import 'server-only';

// Cache em memória do processo, com validade, para resultados caros que podem
// ficar alguns minutos defasados sem prejuízo (ex.: opções de um filtro).
// Guarda a PROMESSA: acessos simultâneos esperam a mesma consulta em vez de
// dispararem várias. Não usar para dados que o usuário acabou de gravar e
// espera ver na hora.
const entradas = new Map<string, { expira: number; valor: Promise<unknown> }>();
const MAX_ENTRADAS = 500;

export function lembrar<T>(chave: string, validadeMs: number, calcular: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const atual = entradas.get(chave);
  if (atual && atual.expira > agora) return atual.valor as Promise<T>;

  if (entradas.size >= MAX_ENTRADAS) {
    for (const [k, e] of entradas) if (e.expira <= agora) entradas.delete(k);
    if (entradas.size >= MAX_ENTRADAS) entradas.delete(entradas.keys().next().value!);
  }

  const valor = calcular();
  entradas.set(chave, { expira: agora + validadeMs, valor });
  valor.catch(() => entradas.delete(chave));
  return valor;
}
