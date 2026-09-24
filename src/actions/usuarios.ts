'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { gerarSenhaInicial, hashSenha } from '@/lib/senha';

const CriarUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Nome muito curto').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  perfil: z.enum(['prefeito', 'secretario', 'chefe']),
  secretariaId: z.string().min(1, 'Selecione a secretaria').max(64),
  divisaoId: z.string().max(64).optional()
});

export type EstadoCriarUsuario =
  | { ok?: undefined; erro?: string }
  | { ok: true; nome: string; email: string; senhaInicial: string };

// Cadastra uma nova pessoa e já atribui o cargo (perfil) e a lotação dela.
// Prefeito atribui qualquer cargo em qualquer secretaria; secretário só
// cadastra chefes dentro das secretarias sob sua responsabilidade.
// A senha inicial é gerada aqui e devolvida UMA vez ao administrador; o banco
// guarda só o hash.
export async function criarUsuario(_anterior: EstadoCriarUsuario, formData: FormData): Promise<EstadoCriarUsuario> {
  const user = await getCurrentUser();
  if (!user) return { erro: 'Sessão expirada. Entre novamente.' };

  const parsed = CriarUsuarioSchema.safeParse({
    nome: formData.get('nome'),
    email: formData.get('email'),
    perfil: formData.get('perfil'),
    secretariaId: formData.get('secretariaId'),
    divisaoId: (formData.get('divisaoId') as string | null) || undefined
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  const dados = parsed.data;

  if (!can(user, 'user.manageSecretaria', { secretariaDonaId: dados.secretariaId })) {
    return { erro: 'Você não pode atribuir pessoas a essa secretaria.' };
  }
  if (user.perfil === 'secretario' && dados.perfil !== 'chefe') {
    return { erro: 'Secretários só podem cadastrar pessoas no cargo de chefe.' };
  }

  if (dados.divisaoId) {
    const divisao = await prisma.divisao.findUnique({ where: { id: dados.divisaoId } });
    if (!divisao || divisao.secretariaId !== dados.secretariaId) {
      return { erro: 'Divisão não pertence à secretaria selecionada.' };
    }
  }

  const emailExiste = await prisma.usuario.findUnique({ where: { email: dados.email } });
  if (emailExiste) return { erro: 'Já existe um usuário com esse e-mail.' };

  const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const senhaInicial = gerarSenhaInicial();

  await prisma.usuario.create({
    data: {
      id,
      nome: dados.nome,
      email: dados.email,
      perfil: dados.perfil,
      senhaHash: await hashSenha(senhaInicial),
      lotacoes: {
        create: { secretariaId: dados.secretariaId, divisaoId: dados.divisaoId ?? null }
      }
    }
  });

  await prisma.auditoria.create({
    data: {
      atorId: user.id,
      atorNome: user.nome,
      perfil: user.perfil,
      msg: `cadastrou "${dados.nome}" no cargo de ${dados.perfil}`,
      tag: 'USUARIO:CRIADO',
      entidade: 'usuario',
      entidadeId: id
    }
  });

  revalidatePath('/usuarios');
  revalidatePath('/organograma');
  return { ok: true, nome: dados.nome, email: dados.email, senhaInicial };
}
