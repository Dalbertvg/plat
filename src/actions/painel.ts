'use server';

import { getCurrentUser } from '@/lib/session';
import { computeStatusAcao } from '@/lib/format';
import {
  carregarBasePainel, carregarNomesOrganizacao, classificarAtrasadas, detalharAtrasadas
} from '@/lib/painel';
import type { AcaoAtrasadaRow } from '@/app/(app)/painel/AcoesAtrasadas';

// Lista completa de ações em atraso, carregada só quando o usuário abre o
// quadro no painel — é o bloco mais pesado da tela (cobranças e comentários
// de cada ação) e a maioria dos acessos nem chega a abri-lo. Sem parâmetros:
// o escopo sai sempre da sessão, com as mesmas regras da página.
export async function listarAcoesAtrasadas(): Promise<AcaoAtrasadaRow[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const [{ metas, acoes }, nomes] = await Promise.all([
    carregarBasePainel(user),
    carregarNomesOrganizacao()
  ]);
  const hoje = new Date();
  const atrasadas = acoes.filter(a => computeStatusAcao(a, hoje) === 'atraso');
  const classificadas = await classificarAtrasadas(user, atrasadas, new Map(metas.map(m => [m.id, m])));
  return detalharAtrasadas(user, classificadas, nomes);
}
