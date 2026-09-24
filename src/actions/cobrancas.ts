'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { RBACError } from '@/lib/rbac';
import { computeStatusAcao } from '@/lib/format';

const CobrarSchema = z.object({
  acaoId: z.string().min(1),
  mensagem: z.string().max(280).optional()
});

// Janela mínima entre cobranças na mesma ação, para evitar spam do responsável.
const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h

export type CobrarResultado =
  | { ok: true; quando: string }
  | { ok: false; erro: string; ultimaEm?: string };

// Registra uma "cobrança" (nudge) do prefeito, secretário dono ou chefe da divisão
// executora sobre uma ação em atraso. Persistimos como entrada de Auditoria com
// tag ACAO:COBRANCA — assim aparece no histórico da ação sem precisar de uma
// nova tabela e a Auditoria já é o feed que os revisores acompanham.
export async function cobrarAcao(input: {
  acaoId: string;
  mensagem?: string;
}): Promise<CobrarResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: 'Sem sessão' };

  const parsed = CobrarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: 'Dados inválidos' };

  const acao = await prisma.acao.findUnique({
    where: { id: parsed.data.acaoId },
    include: { metaCP: true, responsavel: true }
  });
  if (!acao) return { ok: false, erro: 'Ação não encontrada' };

  // Autorização: prefeito (qualquer) ou secretário lotado na secretaria dona.
  // Chefe é a base da hierarquia — não tem subordinado pra cobrar, só pode
  // responder (anexar mensagem) quando ele mesmo é o responsável cobrado.
  const podeCobrar =
    user.perfil === 'prefeito' ||
    (user.perfil === 'secretario' &&
      user.lotacoes.some(l => l.secretariaId === acao.metaCP.secretariaDonaId));

  if (!podeCobrar) {
    throw new RBACError('Sem permissão para cobrar esta ação');
  }

  // Só cobra ações efetivamente em atraso — status derivado das datas, não do
  // campo `status` no BD (que agora é apenas informativo).
  if (computeStatusAcao(acao) !== 'atraso') {
    return { ok: false, erro: 'Ação não está em atraso pelo cálculo (início + tempo necessário).' };
  }

  // Cooldown: evita disparos repetidos do mesmo ator na mesma ação.
  const desde = new Date(Date.now() - COOLDOWN_MS);
  const ultima = await prisma.auditoria.findFirst({
    where: {
      entidade: 'acao',
      entidadeId: acao.id,
      tag: 'ACAO:COBRANCA',
      atorId: user.id,
      quando: { gte: desde }
    },
    orderBy: { quando: 'desc' }
  });
  if (ultima) {
    return {
      ok: false,
      erro: 'Você já cobrou esta ação recentemente — aguarde 12h para reforçar.',
      ultimaEm: ultima.quando.toISOString()
    };
  }

  const nome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';
  const respLabel = acao.responsavel?.nome ?? 'responsável';
  const msgExtra = parsed.data.mensagem?.trim();
  const msg = msgExtra
    ? `cobrou ${respLabel} sobre "${acao.nome}" — ${msgExtra.slice(0, 200)}`
    : `cobrou ${respLabel} sobre "${acao.nome}"`;

  const audit = await prisma.auditoria.create({
    data: {
      atorId: user.id,
      atorNome: nome,
      perfil: user.perfil,
      msg,
      tag: 'ACAO:COBRANCA',
      entidade: 'acao',
      entidadeId: acao.id
    }
  });

  revalidatePath('/painel');
  revalidatePath(`/metas/${acao.metaCPId}`);
  revalidatePath('/auditoria');

  return { ok: true, quando: audit.quando.toISOString() };
}

// ---- Resposta à cobrança ----

const ResponderSchema = z.object({
  cobrancaId: z.string().min(1),
  mensagem: z.string().min(1).max(500)
});

export type ResponderResultado =
  | { ok: true }
  | { ok: false; erro: string };

export async function responderCobranca(input: {
  cobrancaId: string;
  mensagem: string;
}): Promise<ResponderResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: 'Sem sessão' };

  const parsed = ResponderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: 'Dados inválidos' };

  const cobranca = await prisma.auditoria.findUnique({
    where: { id: parsed.data.cobrancaId }
  });
  if (!cobranca || cobranca.tag !== 'ACAO:COBRANCA') {
    return { ok: false, erro: 'Cobrança não encontrada' };
  }

  const acao = await prisma.acao.findUnique({
    where: { id: cobranca.entidadeId }
  });
  if (!acao) return { ok: false, erro: 'Ação não encontrada' };

  if (acao.responsavelId !== user.id) {
    return { ok: false, erro: 'Somente o responsável pela ação pode responder à cobrança' };
  }

  const jaRespondeu = await prisma.auditoria.findFirst({
    where: { parentId: cobranca.id, tag: 'ACAO:RESPOSTA_COBRANCA' }
  });
  if (jaRespondeu) {
    return { ok: false, erro: 'Esta cobrança já foi respondida' };
  }

  const nome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';

  await prisma.auditoria.create({
    data: {
      atorId: user.id,
      atorNome: nome,
      perfil: user.perfil,
      msg: parsed.data.mensagem.trim().slice(0, 500),
      tag: 'ACAO:RESPOSTA_COBRANCA',
      entidade: 'acao',
      entidadeId: acao.id,
      parentId: cobranca.id
    }
  });

  revalidatePath('/painel');
  revalidatePath(`/metas/${acao.metaCPId}`);
  revalidatePath('/auditoria');

  return { ok: true };
}

// ---- Comentário livre (o "anexar mensagem" do chefe) ----
//
// Diferente da cobrança, não é uma cobrança de ninguém — é uma nota no
// histórico da ação. É o canal do chefe de divisão: ele não cobra (não tem
// subordinado pra cobrar, é a base da hierarquia), mas continua podendo
// comentar sobre qualquer ação sob sua divisão, seja ele o responsável ou
// esteja só acompanhando o trabalho de outro chefe da mesma divisão.

const ComentarSchema = z.object({
  acaoId: z.string().min(1),
  mensagem: z.string().min(1, 'Escreva uma mensagem').max(500)
});

export type ComentarResultado =
  | { ok: true }
  | { ok: false; erro: string };

export async function comentarAcao(input: { acaoId: string; mensagem: string }): Promise<ComentarResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: 'Sem sessão' };

  const parsed = ComentarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos' };

  const acao = await prisma.acao.findUnique({
    where: { id: parsed.data.acaoId },
    include: { metaCP: true }
  });
  if (!acao) return { ok: false, erro: 'Ação não encontrada' };

  // Mesmo escopo de VISIBILIDADE usado no painel: prefeito, secretário dono,
  // chefe da divisão executora, ou o próprio responsável pela ação.
  const podeComentar =
    user.perfil === 'prefeito' ||
    (user.perfil === 'secretario' &&
      user.lotacoes.some(l => l.secretariaId === acao.metaCP.secretariaDonaId)) ||
    (user.perfil === 'chefe' &&
      user.lotacoes.some(l => l.divisaoId === acao.metaCP.divisaoExecutoraId)) ||
    acao.responsavelId === user.id;

  if (!podeComentar) {
    throw new RBACError('Sem permissão para comentar nesta ação');
  }

  const nome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';

  await prisma.auditoria.create({
    data: {
      atorId: user.id,
      atorNome: nome,
      perfil: user.perfil,
      msg: parsed.data.mensagem.trim(),
      tag: 'ACAO:COMENTARIO',
      entidade: 'acao',
      entidadeId: acao.id
    }
  });

  revalidatePath('/painel');
  revalidatePath(`/metas/${acao.metaCPId}`);
  revalidatePath('/auditoria');

  return { ok: true };
}
