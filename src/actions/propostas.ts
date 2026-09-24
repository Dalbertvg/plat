'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, proximoRevisorDe, podeComentarProposta, RBACError, type UserContext } from '@/lib/rbac';
import { pesoDeTempo } from '@/lib/format';
import { redirect } from 'next/navigation';

// Payload estruturado por tipo — o form guiado preenche esse JSON, e o
// applyProposta abaixo consome pra mutar a meta/ação de verdade após aprovação.
const PayloadAjusteAcaoSchema = z.object({
  acaoId: z.string(),
  nome: z.string().optional(),
  tempoNecessario: z.enum(['ate_6m', '7_12m', '13_24m', '25_36m', 'acima_36m']).optional(),
  alvo: z.number().optional(),
  unidade: z.string().max(20).optional(),
  responsavelId: z.string().nullable().optional(), // null = tirar responsável
  inicio: z.string().regex(/^\d{4}-\d{2}$/).optional()
});
const PayloadEdicaoMetaSchema = z.object({
  nome: z.string().min(3).optional(),
  divisaoExecutoraId: z.string().optional()
});
const PayloadNovaMetaSchema = z.object({
  nome: z.string().min(3),
  metaLPId: z.string(),
  divisaoExecutoraId: z.string(),
  participantes: z.array(z.string()).optional()
});

const NovaPropostaSchema = z.object({
  tipo: z.enum(['nova', 'edicao', 'ajuste_acao']),
  titulo: z.string().min(3),
  descricao: z.string().min(3, 'Justificativa obrigatória'),
  secretariaDonaId: z.string(),
  divisaoOrigemId: z.string().optional(),
  metaCPRefId: z.string().optional(),
  payloadJson: z.string().optional() // JSON com o "patch" estruturado
});

export async function submeterProposta(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');
  if (!can(user, 'proposta.submit')) throw new RBACError('Prefeito não submete proposta.');

  const parsed = NovaPropostaSchema.parse({
    tipo: formData.get('tipo'),
    titulo: formData.get('titulo'),
    descricao: formData.get('descricao') || '',
    secretariaDonaId: formData.get('secretariaDonaId'),
    divisaoOrigemId: formData.get('divisaoOrigemId') || undefined,
    metaCPRefId: formData.get('metaCPRefId') || undefined,
    payloadJson: (formData.get('payloadJson') as string | null) || undefined
  });

  // Se veio payload, valida contra o schema do tipo — falha rápido, com msg útil.
  if (parsed.payloadJson) {
    try {
      const obj = JSON.parse(parsed.payloadJson);
      if (parsed.tipo === 'ajuste_acao') PayloadAjusteAcaoSchema.parse(obj);
      else if (parsed.tipo === 'edicao') PayloadEdicaoMetaSchema.parse(obj);
      else if (parsed.tipo === 'nova') PayloadNovaMetaSchema.parse(obj);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payload inválido';
      throw new Error(`Payload inválido: ${msg}`);
    }
  }

  // Se é edição ou ajuste, exige meta alvo
  if ((parsed.tipo === 'edicao' || parsed.tipo === 'ajuste_acao') && !parsed.metaCPRefId) {
    throw new Error('Selecione a meta a ser editada.');
  }

  // A meta alvo tem que ser da secretaria declarada: é essa secretaria que
  // define quem revisa. Sem isto, A poderia rotear para o próprio secretário
  // uma alteração numa meta de B.
  if (parsed.metaCPRefId) {
    const metaAlvo = await prisma.metaCP.findUnique({ where: { id: parsed.metaCPRefId } });
    if (!metaAlvo || metaAlvo.arquivada) throw new Error('Meta alvo inexistente ou arquivada.');
    if (metaAlvo.secretariaDonaId !== parsed.secretariaDonaId) {
      throw new RBACError('A meta alvo não pertence à secretaria informada.');
    }
  }

  // Escopo de propostas por perfil (mais estreito que o de leitura):
  // chefes só podem propor para secretarias das suas próprias lotações;
  // secretários podem propor para qualquer.
  if (user.perfil === 'chefe') {
    const suas = new Set(user.lotacoes.map(l => l.secretariaId));
    if (!suas.has(parsed.secretariaDonaId)) {
      throw new RBACError('Chefes só podem propor para a própria secretaria.');
    }
    // Se divisão de origem foi informada, tem que ser lotação do autor.
    if (parsed.divisaoOrigemId) {
      const suasDivs = new Set(user.lotacoes.map(l => l.divisaoId).filter(Boolean) as string[]);
      if (!suasDivs.has(parsed.divisaoOrigemId)) {
        throw new RBACError('Divisão de origem tem que ser sua lotação.');
      }
    }
  }

  const proximoRevisor = proximoRevisorDe(user, parsed.secretariaDonaId);
  const atorNome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';
  const id = 'PROP-' + Date.now().toString(36).toUpperCase();

  await prisma.proposta.create({
    data: {
      id,
      titulo: parsed.titulo,
      descricao: parsed.descricao,
      tipo: parsed.tipo,
      autorId: user.id,
      secretariaDonaId: parsed.secretariaDonaId,
      divisaoOrigemId: parsed.divisaoOrigemId,
      metaCPRefId: parsed.metaCPRefId,
      proximoRevisor,
      status: 'pendente',
      payloadJson: parsed.payloadJson ?? null
    }
  });

  await prisma.auditoria.create({
    data: {
      atorId: user.id,
      atorNome,
      perfil: user.perfil,
      msg: `submeteu proposta "${parsed.titulo}"`,
      tag: 'PROPOSTA:CRIADA',
      entidade: 'proposta',
      entidadeId: id
    }
  });

  revalidatePath('/propostas');
  redirect('/propostas');
}

export async function aprovarProposta(formData: FormData) {
  const propostaId = String(formData.get('propostaId'));
  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const p = await prisma.proposta.findUnique({ where: { id: propostaId } });
  if (!p) throw new Error('Proposta não encontrada');
  if (p.status !== 'pendente') throw new Error('Esta proposta já foi decidida.');

  const target = { divisaoOrigemId: p.divisaoOrigemId, secretariaDonaId: p.secretariaDonaId };
  let nextRevisor: string | null = null;
  let novoStatus: 'pendente' | 'aprovada' = 'pendente';

  if (user.perfil === 'chefe' && p.proximoRevisor === 'chefe') {
    if (!can(user, 'proposta.approveAsChefe', target)) throw new RBACError('Sem permissão para aprovar como chefe.');
    nextRevisor = 'secretario';
  } else if (user.perfil === 'secretario' && p.proximoRevisor === 'secretario') {
    if (!can(user, 'proposta.approveAsSecretario', target)) throw new RBACError('Sem permissão para aprovar como secretário.');
    // Se o autor era secretário de outra pasta, agora eu (dono) sou o revisor;
    // se aprovar, a proposta ainda precisa passar pelo prefeito.
    const autor = await prisma.usuario.findUnique({
      where: { id: p.autorId },
      include: { lotacoes: true }
    });
    const autorEraSecretarioDeOutraPasta =
      autor?.perfil === 'secretario' &&
      !autor.lotacoes.some(l => l.secretariaId === p.secretariaDonaId);
    if (autorEraSecretarioDeOutraPasta) {
      nextRevisor = 'prefeito';
    } else {
      novoStatus = 'aprovada';
    }
  } else if (user.perfil === 'prefeito' && p.proximoRevisor === 'prefeito') {
    novoStatus = 'aprovada';
  } else {
    throw new RBACError('Fluxo de aprovação incompatível com seu perfil.');
  }

  const atorNome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';

  if (novoStatus === 'aprovada') {
    await prisma.proposta.update({
      where: { id: propostaId },
      data: { status: 'aprovada', aprovadaEm: new Date(), aprovadaPor: user.id }
    });
    await prisma.auditoria.create({
      data: {
        atorId: user.id, atorNome, perfil: user.perfil,
        msg: `aprovou proposta "${p.titulo}"`,
        tag: 'PROPOSTA:APROVADA', entidade: 'proposta', entidadeId: propostaId
      }
    });

    // Aplica o patch estruturado (se houver). Erros aqui NÃO revertem a
    // aprovação — o dono da meta ainda pode aplicar manualmente. Registramos
    // o erro em `aplicacaoErro` para diagnóstico.
    await applyProposta(propostaId, user.id, atorNome, user.perfil);
  } else {
    await prisma.proposta.update({
      where: { id: propostaId },
      data: { proximoRevisor: nextRevisor! }
    });
    await prisma.auditoria.create({
      data: {
        atorId: user.id, atorNome, perfil: user.perfil,
        msg: `encaminhou proposta "${p.titulo}" para ${nextRevisor}`,
        tag: 'PROPOSTA:ENCAMINHADA', entidade: 'proposta', entidadeId: propostaId
      }
    });
  }

  revalidatePath('/propostas');
  revalidatePath('/painel');
}

function podeDecidirAgora(
  user: UserContext,
  p: { proximoRevisor: string; divisaoOrigemId: string | null; secretariaDonaId: string }
): boolean {
  const target = { divisaoOrigemId: p.divisaoOrigemId, secretariaDonaId: p.secretariaDonaId };
  if (p.proximoRevisor === 'chefe') return user.perfil === 'chefe' && can(user, 'proposta.approveAsChefe', target);
  if (p.proximoRevisor === 'secretario') return user.perfil === 'secretario' && can(user, 'proposta.approveAsSecretario', target);
  if (p.proximoRevisor === 'prefeito') return can(user, 'proposta.approveAsPrefeito');
  return false;
}

export async function rejeitarProposta(formData: FormData) {
  const propostaId = String(formData.get('propostaId'));
  const motivo = String(formData.get('motivo') || '').trim();
  if (!motivo) throw new Error('Motivo é obrigatório');

  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const p = await prisma.proposta.findUnique({ where: { id: propostaId } });
  if (!p) throw new Error('Proposta não encontrada');
  if (p.status !== 'pendente') throw new Error('Esta proposta já foi decidida.');
  if (!podeDecidirAgora(user, p)) throw new RBACError('Só o revisor atual pode rejeitar esta proposta.');

  const atorNome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';

  await prisma.proposta.update({
    where: { id: propostaId },
    data: { status: 'rejeitada', rejeitadaEm: new Date(), rejeitadaPor: user.id }
  });
  await prisma.comentario.create({
    data: { propostaId, autorId: user.id, texto: motivo }
  });
  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome, perfil: user.perfil,
      msg: `rejeitou proposta "${p.titulo}" (${motivo.slice(0, 40)})`,
      tag: 'PROPOSTA:REJEITADA', entidade: 'proposta', entidadeId: propostaId
    }
  });

  revalidatePath('/propostas');
  revalidatePath('/painel');
}

// ============================================================================
// Conversa da proposta — comentário livre, fora do fluxo de aprovação/rejeição.
// A regra de quem pode comentar (podeComentarProposta) mora em lib/rbac.ts.
// ============================================================================
export async function responderProposta(formData: FormData) {
  const propostaId = String(formData.get('propostaId'));
  const texto = String(formData.get('texto') || '').trim();
  if (!texto) throw new Error('Escreva uma mensagem.');

  const user = await getCurrentUser();
  if (!user) throw new Error('Sem sessão');

  const p = await prisma.proposta.findUnique({ where: { id: propostaId } });
  if (!p) throw new Error('Proposta não encontrada');
  if (!podeComentarProposta(user, p)) {
    throw new RBACError('Você não tem acesso à conversa desta proposta.');
  }

  const atorNome = (await prisma.usuario.findUnique({ where: { id: user.id } }))?.nome ?? '?';

  await prisma.comentario.create({
    data: { propostaId, autorId: user.id, texto: texto.slice(0, 1000) }
  });
  await prisma.auditoria.create({
    data: {
      atorId: user.id, atorNome, perfil: user.perfil,
      msg: `comentou na proposta "${p.titulo}"`,
      tag: 'PROPOSTA:COMENTARIO', entidade: 'proposta', entidadeId: propostaId
    }
  });

  revalidatePath(`/propostas/${propostaId}`);
  revalidatePath('/propostas');
}

// ============================================================================
// applyProposta — aplica o patch estruturado após aprovação final.
//
// Contratos:
//   - Só roda se a proposta tem `payloadJson` E ainda não foi aplicada.
//   - Erros aqui NÃO desfazem a aprovação — a decisão política já foi tomada.
//     O erro fica gravado em `aplicacaoErro` para intervenção manual.
//   - Grava auditoria com tag META:APLICADA_VIA_PROPOSTA (ou similar) referenciando
//     tanto a proposta quanto a meta/ação alvo — para rastrear as duas pontas.
// ============================================================================
async function applyProposta(
  propostaId: string,
  aprovadorId: string,
  aprovadorNome: string,
  aprovadorPerfil: string
): Promise<void> {
  const p = await prisma.proposta.findUnique({ where: { id: propostaId } });
  if (!p) return;
  if (!p.payloadJson) return;      // proposta em texto livre — não há o que aplicar
  if (p.aplicadaEm) return;        // já aplicada; idempotente

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(p.payloadJson);
  } catch {
    await prisma.proposta.update({
      where: { id: propostaId },
      data: { aplicacaoErro: 'payloadJson não é JSON válido' }
    });
    return;
  }

  try {
    if (p.tipo === 'ajuste_acao') {
      await aplicarAjusteAcao(p, payload, aprovadorId, aprovadorNome, aprovadorPerfil);
    } else if (p.tipo === 'edicao') {
      await aplicarEdicaoMeta(p, payload, aprovadorId, aprovadorNome, aprovadorPerfil);
    } else if (p.tipo === 'nova') {
      await aplicarNovaMeta(p, payload, aprovadorId, aprovadorNome, aprovadorPerfil);
    }
    await prisma.proposta.update({
      where: { id: propostaId },
      data: { aplicadaEm: new Date(), aplicacaoErro: null }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.proposta.update({
      where: { id: propostaId },
      data: { aplicacaoErro: msg.slice(0, 500) }
    });
    // NÃO relanço: a aprovação continua válida; o erro é retornado via UI.
  }

  revalidatePath('/metas');
  revalidatePath(`/metas/${p.metaCPRefId ?? ''}`);
  revalidatePath('/painel');
  revalidatePath('/auditoria');
}

async function aplicarAjusteAcao(
  p: { id: string; titulo: string; metaCPRefId: string | null; secretariaDonaId: string },
  raw: Record<string, unknown>,
  aprovadorId: string, aprovadorNome: string, aprovadorPerfil: string
) {
  const payload = PayloadAjusteAcaoSchema.parse(raw);
  const acao = await prisma.acao.findUnique({ where: { id: payload.acaoId }, include: { metaCP: true } });
  if (!acao) throw new Error(`Ação ${payload.acaoId} não existe mais.`);
  if (p.metaCPRefId && acao.metaCPId !== p.metaCPRefId) {
    throw new Error('Ação alvo não pertence à meta declarada na proposta.');
  }
  if (acao.metaCP.secretariaDonaId !== p.secretariaDonaId) {
    throw new Error('Ação alvo não pertence à secretaria que aprovou a proposta.');
  }
  if (acao.metaCP.arquivada) {
    throw new Error(`Meta ${acao.metaCPId} foi arquivada antes da aplicação — intervenção manual necessária.`);
  }

  const patch: Record<string, unknown> = {};
  const mudancas: string[] = [];
  if (payload.nome && payload.nome !== acao.nome) {
    patch.nome = payload.nome;
    mudancas.push(`nome → "${payload.nome}"`);
  }
  if (payload.tempoNecessario && payload.tempoNecessario !== acao.tempoNecessario) {
    patch.tempoNecessario = payload.tempoNecessario;
    // Peso deriva do tempo. Recalcula pra manter consistência.
    patch.peso = pesoDeTempo(payload.tempoNecessario);
    mudancas.push(`tempo → ${payload.tempoNecessario} (peso ${patch.peso})`);
  }
  if (payload.alvo != null && payload.alvo !== acao.alvo) {
    patch.alvo = payload.alvo;
    mudancas.push(`alvo → ${payload.alvo}`);
  }
  if (payload.unidade != null && payload.unidade !== acao.unidade) {
    patch.unidade = payload.unidade;
    mudancas.push(`unidade → ${payload.unidade}`);
  }
  if ('responsavelId' in payload && payload.responsavelId !== acao.responsavelId) {
    patch.responsavelId = payload.responsavelId ?? null;
    mudancas.push(`responsável → ${payload.responsavelId ?? '(nenhum)'}`);
  }
  if (payload.inicio && payload.inicio !== (acao.inicio ?? '').slice(0, 7)) {
    patch.inicio = payload.inicio;
    mudancas.push(`início → ${payload.inicio}`);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('Nenhuma mudança efetiva — a ação já está como o payload pedia.');
  }

  await prisma.acao.update({ where: { id: acao.id }, data: patch });
  await prisma.auditoria.create({
    data: {
      atorId: aprovadorId, atorNome: aprovadorNome, perfil: aprovadorPerfil,
      msg: `aplicou proposta "${p.titulo}" na ação "${acao.nome}": ${mudancas.join('; ')}`,
      tag: 'ACAO:APLICADA_VIA_PROPOSTA', entidade: 'acao', entidadeId: acao.id
    }
  });
}

async function aplicarEdicaoMeta(
  p: { id: string; titulo: string; metaCPRefId: string | null; secretariaDonaId: string },
  raw: Record<string, unknown>,
  aprovadorId: string, aprovadorNome: string, aprovadorPerfil: string
) {
  const payload = PayloadEdicaoMetaSchema.parse(raw);
  if (!p.metaCPRefId) throw new Error('Proposta de edição sem meta alvo (metaCPRefId).');
  const meta = await prisma.metaCP.findUnique({ where: { id: p.metaCPRefId } });
  if (!meta) throw new Error(`Meta ${p.metaCPRefId} não existe mais.`);
  if (meta.arquivada) throw new Error(`Meta ${p.metaCPRefId} foi arquivada antes da aplicação — intervenção manual necessária.`);
  if (meta.secretariaDonaId !== p.secretariaDonaId) {
    throw new Error('Meta alvo não pertence à secretaria que aprovou a proposta.');
  }
  if (payload.divisaoExecutoraId) {
    const div = await prisma.divisao.findUnique({ where: { id: payload.divisaoExecutoraId } });
    if (!div || div.secretariaId !== meta.secretariaDonaId) {
      throw new Error('Divisão executora não pertence à secretaria dona da meta.');
    }
  }

  const patch: Record<string, unknown> = {};
  const mudancas: string[] = [];
  if (payload.nome && payload.nome !== meta.nome) {
    patch.nome = payload.nome;
    mudancas.push(`nome → "${payload.nome}"`);
  }
  if (payload.divisaoExecutoraId && payload.divisaoExecutoraId !== meta.divisaoExecutoraId) {
    patch.divisaoExecutoraId = payload.divisaoExecutoraId;
    mudancas.push(`divisão executora → ${payload.divisaoExecutoraId}`);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error('Nenhuma mudança efetiva.');
  }
  await prisma.metaCP.update({ where: { id: meta.id }, data: patch });
  await prisma.auditoria.create({
    data: {
      atorId: aprovadorId, atorNome: aprovadorNome, perfil: aprovadorPerfil,
      msg: `aplicou proposta "${p.titulo}" na meta "${meta.nome}": ${mudancas.join('; ')}`,
      tag: 'META:APLICADA_VIA_PROPOSTA', entidade: 'meta', entidadeId: meta.id
    }
  });
}

async function aplicarNovaMeta(
  p: { id: string; titulo: string; secretariaDonaId: string },
  raw: Record<string, unknown>,
  aprovadorId: string, aprovadorNome: string, aprovadorPerfil: string
) {
  const payload = PayloadNovaMetaSchema.parse(raw);
  const div = await prisma.divisao.findUnique({ where: { id: payload.divisaoExecutoraId } });
  if (!div || div.secretariaId !== p.secretariaDonaId) {
    throw new Error('Divisão executora não pertence à secretaria da proposta.');
  }
  const id = 'MCP-' + Date.now().toString(36).toUpperCase();
  await prisma.metaCP.create({
    data: {
      id,
      nome: payload.nome,
      tipo: 'secundaria', // metas nascidas de proposta nunca são "do plano de governo"
      metaLPId: payload.metaLPId,
      secretariaDonaId: p.secretariaDonaId,
      divisaoExecutoraId: payload.divisaoExecutoraId
    }
  });
  for (const secId of payload.participantes ?? []) {
    await prisma.metaCPParticipante.create({
      data: { metaCPId: id, secretariaId: secId }
    });
  }
  await prisma.auditoria.create({
    data: {
      atorId: aprovadorId, atorNome: aprovadorNome, perfil: aprovadorPerfil,
      msg: `criou meta "${payload.nome}" via proposta "${p.titulo}"`,
      tag: 'META:CRIADA_VIA_PROPOSTA', entidade: 'meta', entidadeId: id
    }
  });
}
