'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, RBACError } from '@/lib/rbac';
import { computeStatusAcao } from '@/lib/format';

const UpdateAcaoSchema = z.object({
  acaoId: z.string(),
  situacaoAtualPct: z.coerce.number().min(0).max(100),
  justificativa: z.string().min(3, 'Justificativa obrigatória (mínimo 3 caracteres)')
});

export async function updateAcao(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const parsedInput = UpdateAcaoSchema.parse({
    acaoId: formData.get('acaoId'),
    situacaoAtualPct: formData.get('situacaoAtual'),
    justificativa: formData.get('justificativa') || ''
  });
  // Internamente a situação é normalizada em 0–1 (usada no cálculo ponderado
  // das metas e no limiar de "concluída" ≥ 0,99) — o form pede porcentagem,
  // que é o que faz sentido pra quem preenche.
  const parsed = { ...parsedInput, situacaoAtual: parsedInput.situacaoAtualPct / 100 };

  const acao = await prisma.acao.findUnique({
    where: { id: parsed.acaoId },
    include: { metaCP: true }
  });
  if (!acao) throw new Error('Ação não encontrada');
  if (acao.metaCP.arquivada) throw new Error('Meta arquivada — não é possível atualizar ações dela.');

  const target = {
    secretariaDonaId: acao.metaCP.secretariaDonaId,
    divisaoExecutoraId: acao.metaCP.divisaoExecutoraId,
    responsavelId: acao.responsavelId
  };

  const canFull = can(user, 'acao.edit', target);
  const canSit = can(user, 'acao.updateSituacao', target);
  if (!canFull && !canSit) throw new RBACError('Sem permissão para editar esta ação');

  const derivedStatus = computeStatusAcao({
    inicio: acao.inicio,
    tempoNecessario: acao.tempoNecessario,
    situacaoAtual: parsed.situacaoAtual
  });
  const statusMap: Record<string, string> = {
    nao_iniciada: 'andamento', andamento: 'andamento', atraso: 'atraso', concluida: 'concluida'
  };

  const patch: Record<string, unknown> = {
    situacaoAtual: parsed.situacaoAtual,
    status: statusMap[derivedStatus],
    ultJustificativa: parsed.justificativa,
    ultJustQuando: new Date()
  };

  await prisma.acao.update({ where: { id: parsed.acaoId }, data: patch });

  // Snapshot histórico: só grava se o valor mudou (evita entradas duplicadas).
  if (parsed.situacaoAtual !== acao.situacaoAtual) {
    await prisma.acaoSnapshot.create({
      data: {
        acaoId: acao.id,
        situacaoAtual: parsed.situacaoAtual,
        peso: acao.peso
      }
    });
  }

  await prisma.auditoria.create({
    data: {
      atorId: user.id,
      atorNome: (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?',
      perfil: user.perfil,
      msg: `atualizou ação "${acao.nome}" (${parsed.justificativa.slice(0, 40)})`,
      tag: 'ACAO:UPDATE',
      entidade: 'acao',
      entidadeId: acao.id
    }
  });

  revalidatePath(`/metas/${acao.metaCPId}`);
  revalidatePath('/painel');
}
