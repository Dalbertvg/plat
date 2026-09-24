'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, requireCan, RBACError } from '@/lib/rbac';
import { pesoDeTempo, TEMPO_OPCOES } from '@/lib/format';

const TempoEnum = z.enum(TEMPO_OPCOES.map(t => t.value) as [string, ...string[]]);

async function atorNome(userId: string): Promise<string> {
  return (await prisma.usuario.findUnique({ where: { id: userId } }))?.nome ?? '?';
}

// ============================================================================
// MetaCP — criar / atualizar / deletar
// ============================================================================
const CriarMetaSchema = z.object({
  nome: z.string().min(3),
  metaLPId: z.string(),
  secretariaDonaId: z.string(),
  divisaoExecutoraId: z.string(),
  tipo: z.enum(['principal', 'secundaria']).optional().default('secundaria'),
  participantes: z.array(z.string()).optional().default([])
});

export async function criarMetaCP(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const parsed = CriarMetaSchema.parse({
    nome: formData.get('nome'),
    metaLPId: formData.get('metaLPId'),
    secretariaDonaId: formData.get('secretariaDonaId'),
    divisaoExecutoraId: formData.get('divisaoExecutoraId'),
    tipo: formData.get('tipo') || undefined,
    participantes: formData.getAll('participantes').map(String).filter(Boolean)
  });

  requireCan(user, 'meta.create', { secretariaDonaId: parsed.secretariaDonaId });

  // Só o prefeito marca uma meta como "principal" (plano de governo) — qualquer
  // outra pessoa criando uma meta produz sempre uma meta secundária.
  const tipo = user.perfil === 'prefeito' ? parsed.tipo : 'secundaria';

  // Divisão executora tem que pertencer à secretaria dona.
  const div = await prisma.divisao.findUnique({ where: { id: parsed.divisaoExecutoraId } });
  if (!div) throw new Error('Divisão executora inválida');
  if (div.secretariaId !== parsed.secretariaDonaId) throw new Error('Divisão executora não pertence à secretaria dona');

  const id = 'MCP-' + Date.now().toString(36).toUpperCase();

  await prisma.metaCP.create({
    data: {
      id,
      nome: parsed.nome,
      tipo,
      metaLPId: parsed.metaLPId,
      secretariaDonaId: parsed.secretariaDonaId,
      divisaoExecutoraId: parsed.divisaoExecutoraId,
      participantes: {
        create: parsed.participantes
          .filter(sid => sid !== parsed.secretariaDonaId)
          .map(sid => ({ secretariaId: sid }))
      }
    }
  });

  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome: await atorNome(user.id), perfil: user.perfil,
      msg: `criou meta "${parsed.nome}"`,
      tag: 'META:CRIADA', entidade: 'metaCP', entidadeId: id
    }
  });

  revalidatePath('/metas');
  revalidatePath('/painel');
  redirect(`/metas/${id}`);
}

const AtualizarMetaSchema = z.object({
  metaCPId: z.string(),
  nome: z.string().min(3),
  divisaoExecutoraId: z.string(),
  tipo: z.enum(['principal', 'secundaria']).optional(),
  participantes: z.array(z.string()).optional().default([])
});

export async function atualizarMetaCP(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const parsed = AtualizarMetaSchema.parse({
    metaCPId: formData.get('metaCPId'),
    nome: formData.get('nome'),
    divisaoExecutoraId: formData.get('divisaoExecutoraId'),
    tipo: formData.get('tipo') || undefined,
    participantes: formData.getAll('participantes').map(String).filter(Boolean)
  });

  const meta = await prisma.metaCP.findUnique({ where: { id: parsed.metaCPId } });
  if (!meta) throw new Error('Meta não encontrada');
  if (meta.arquivada) throw new Error('Meta arquivada — não pode ser editada.');
  requireCan(user, 'meta.edit', { secretariaDonaId: meta.secretariaDonaId });

  const div = await prisma.divisao.findUnique({ where: { id: parsed.divisaoExecutoraId } });
  if (!div) throw new Error('Divisão executora inválida');
  if (div.secretariaId !== meta.secretariaDonaId) throw new Error('Divisão executora não pertence à secretaria dona');

  // Só o prefeito pode (re)marcar uma meta como principal/secundária.
  const tipo = user.perfil === 'prefeito' && parsed.tipo ? parsed.tipo : meta.tipo;

  await prisma.$transaction([
    prisma.metaCP.update({
      where: { id: parsed.metaCPId },
      data: { nome: parsed.nome, divisaoExecutoraId: parsed.divisaoExecutoraId, tipo }
    }),
    prisma.metaCPParticipante.deleteMany({ where: { metaCPId: parsed.metaCPId } }),
    prisma.metaCPParticipante.createMany({
      data: parsed.participantes
        .filter(sid => sid !== meta.secretariaDonaId)
        .map(sid => ({ metaCPId: parsed.metaCPId, secretariaId: sid }))
    })
  ]);

  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome: await atorNome(user.id), perfil: user.perfil,
      msg: `atualizou meta "${parsed.nome}"`,
      tag: 'META:ATUALIZADA', entidade: 'metaCP', entidadeId: parsed.metaCPId
    }
  });

  revalidatePath(`/metas/${parsed.metaCPId}`);
  revalidatePath(`/metas/${parsed.metaCPId}/editar`);
  revalidatePath('/metas');
  revalidatePath('/painel');
  // Mantém o usuário na tela de edição após salvar.
  redirect(`/metas/${parsed.metaCPId}/editar`);
}

// "Excluir" uma meta nunca apaga de fato — arquiva, com justificativa
// obrigatória. Preserva histórico (ações, propostas, auditoria) e evita perda
// acidental de dados que o prefeito não consiga desfazer.
export async function arquivarMetaCP(formData: FormData) {
  const metaCPId = String(formData.get('metaCPId'));
  const justificativa = String(formData.get('justificativa') || '').trim();
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  if (justificativa.length < 10) {
    throw new Error('Justificativa obrigatória (mínimo 10 caracteres).');
  }

  const meta = await prisma.metaCP.findUnique({ where: { id: metaCPId } });
  if (!meta) throw new Error('Meta não encontrada');
  if (user.perfil !== 'prefeito') throw new RBACError('Somente o prefeito pode arquivar metas.');
  if (meta.arquivada) throw new Error('Esta meta já está arquivada.');

  await prisma.metaCP.update({
    where: { id: metaCPId },
    data: {
      arquivada: true,
      arquivadaEm: new Date(),
      arquivadaPor: user.id,
      arquivadaJustificativa: justificativa
    }
  });

  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome: await atorNome(user.id), perfil: user.perfil,
      msg: `arquivou meta "${meta.nome}" — ${justificativa.slice(0, 200)}`,
      tag: 'META:ARQUIVADA', entidade: 'metaCP', entidadeId: metaCPId
    }
  });

  revalidatePath('/metas');
  revalidatePath('/painel');
  redirect('/metas');
}

// ============================================================================
// Ação — criar / atualizar (dados) / deletar
// ============================================================================
const CriarAcaoSchema = z.object({
  metaCPId: z.string(),
  nome: z.string().min(3),
  tempoNecessario: TempoEnum,
  alvo: z.coerce.number().min(0),
  unidade: z.string().optional(),
  inicio: z.string().optional(),
  prazo: z.string().optional(),
  responsavelId: z.string().optional()
});

export async function criarAcao(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const parsed = CriarAcaoSchema.parse({
    metaCPId: formData.get('metaCPId'),
    nome: formData.get('nome'),
    tempoNecessario: formData.get('tempoNecessario'),
    alvo: formData.get('alvo'),
    unidade: formData.get('unidade') || undefined,
    inicio: formData.get('inicio') || undefined,
    prazo: formData.get('prazo') || undefined,
    responsavelId: formData.get('responsavelId') || undefined
  });

  const meta = await prisma.metaCP.findUnique({ where: { id: parsed.metaCPId } });
  if (!meta) throw new Error('Meta não encontrada');
  if (meta.arquivada) throw new Error('Meta arquivada — não é possível criar ações nela.');

  const target = {
    secretariaDonaId: meta.secretariaDonaId,
    divisaoExecutoraId: meta.divisaoExecutoraId
  };
  if (!can(user, 'acao.edit', target)) throw new RBACError('Sem permissão para criar ações nesta meta.');

  const id = 'ACAO-' + Date.now().toString(36).toUpperCase();
  const pesoAuto = pesoDeTempo(parsed.tempoNecessario);

  await prisma.acao.create({
    data: {
      id,
      metaCPId: parsed.metaCPId,
      nome: parsed.nome,
      peso: pesoAuto,
      tempoNecessario: parsed.tempoNecessario,
      alvo: parsed.alvo,
      unidade: parsed.unidade,
      situacaoAtual: 0,
      status: 'andamento',
      inicio: parsed.inicio,
      prazo: parsed.prazo,
      responsavelId: parsed.responsavelId
    }
  });

  // Snapshot inicial (baseline zero) — permite calcular variação desde a criação.
  await prisma.acaoSnapshot.create({
    data: { acaoId: id, situacaoAtual: 0, peso: pesoAuto }
  });

  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome: await atorNome(user.id), perfil: user.perfil,
      msg: `criou ação "${parsed.nome}"`,
      tag: 'ACAO:CRIADA', entidade: 'acao', entidadeId: id
    }
  });

  revalidatePath(`/metas/${parsed.metaCPId}`);
  revalidatePath('/painel');
}

const AtualizarAcaoDadosSchema = z.object({
  acaoId: z.string(),
  nome: z.string().min(3),
  tempoNecessario: TempoEnum,
  alvo: z.coerce.number().min(0),
  unidade: z.string().optional(),
  inicio: z.string().optional(),
  prazo: z.string().optional(),
  responsavelId: z.string().optional()
});

export async function atualizarAcaoDados(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const parsed = AtualizarAcaoDadosSchema.parse({
    acaoId: formData.get('acaoId'),
    nome: formData.get('nome'),
    tempoNecessario: formData.get('tempoNecessario'),
    alvo: formData.get('alvo'),
    unidade: formData.get('unidade') || undefined,
    inicio: formData.get('inicio') || undefined,
    prazo: formData.get('prazo') || undefined,
    responsavelId: formData.get('responsavelId') || undefined
  });

  const acao = await prisma.acao.findUnique({
    where: { id: parsed.acaoId },
    include: { metaCP: true }
  });
  if (!acao) throw new Error('Ação não encontrada');
  if (acao.metaCP.arquivada) throw new Error('Meta arquivada — não é possível editar esta ação.');

  const target = {
    secretariaDonaId: acao.metaCP.secretariaDonaId,
    divisaoExecutoraId: acao.metaCP.divisaoExecutoraId
  };
  if (!can(user, 'acao.edit', target)) throw new RBACError('Sem permissão para editar dados desta ação.');

  const pesoAuto = pesoDeTempo(parsed.tempoNecessario);

  await prisma.acao.update({
    where: { id: parsed.acaoId },
    data: {
      nome: parsed.nome,
      peso: pesoAuto,
      tempoNecessario: parsed.tempoNecessario,
      alvo: parsed.alvo,
      unidade: parsed.unidade ?? null,
      inicio: parsed.inicio ?? null,
      prazo: parsed.prazo ?? null,
      responsavelId: parsed.responsavelId ?? null
    }
  });

  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome: await atorNome(user.id), perfil: user.perfil,
      msg: `editou dados da ação "${parsed.nome}"`,
      tag: 'ACAO:EDITADA', entidade: 'acao', entidadeId: parsed.acaoId
    }
  });

  revalidatePath(`/metas/${acao.metaCPId}`);
}

export async function deletarAcao(formData: FormData) {
  const acaoId = String(formData.get('acaoId'));
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const acao = await prisma.acao.findUnique({
    where: { id: acaoId },
    include: { metaCP: true }
  });
  if (!acao) throw new Error('Ação não encontrada');
  if (acao.metaCP.arquivada) throw new Error('Meta arquivada — não é possível excluir ações dela.');

  const target = {
    secretariaDonaId: acao.metaCP.secretariaDonaId,
    divisaoExecutoraId: acao.metaCP.divisaoExecutoraId
  };
  if (!can(user, 'acao.edit', target)) throw new RBACError('Sem permissão para excluir esta ação.');

  await prisma.acao.delete({ where: { id: acaoId } });

  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome: await atorNome(user.id), perfil: user.perfil,
      msg: `excluiu ação "${acao.nome}"`,
      tag: 'ACAO:DELETADA', entidade: 'acao', entidadeId: acaoId
    }
  });

  revalidatePath(`/metas/${acao.metaCPId}`);
}
