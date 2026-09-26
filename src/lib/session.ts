import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from './db';
import type { Perfil, UserContext } from './rbac';
import { temaEfetivo, type Tema } from './temas';

export type UsuarioSessao = UserContext & { nome: string; email: string; tema: Tema };

const PERFIS: ReadonlySet<string> = new Set<Perfil>(['prefeito', 'secretario', 'chefe']);

// Fonte única de identidade para páginas e Server Actions. O JWT só diz QUEM
// é; perfil e lotações vêm sempre do banco, então mudanças de permissão,
// desativação e revogação de sessão valem na requisição seguinte.
export const getCurrentUser = cache(async (): Promise<UsuarioSessao | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true, nome: true, email: true, perfil: true, ativo: true, sessaoVersao: true, tema: true,
      lotacoes: { select: { secretariaId: true, divisaoId: true } }
    }
  });
  if (!usuario || !usuario.ativo) return null;
  if (usuario.sessaoVersao !== session.user.sessaoVersao) return null;
  if (!PERFIS.has(usuario.perfil)) return null;

  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    tema: temaEfetivo(usuario.tema),
    perfil: usuario.perfil as Perfil,
    lotacoes: usuario.lotacoes.map(l => ({ secretariaId: l.secretariaId, divisaoId: l.divisaoId }))
  };
});

export async function requireUser(): Promise<UsuarioSessao> {
  const usuario = await getCurrentUser();
  if (!usuario) redirect('/login');
  return usuario;
}
