'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { TEMAS } from '@/lib/temas';

const TemaSchema = z.enum(TEMAS.map(t => t.key) as [string, ...string[]]);

export type SalvarTemaResultado = { ok: true } | { ok: false; erro: string };

// Grava o tema de cores do próprio usuário (área "Aparência" do menu). Só
// altera o registro de quem está logado. Preferência visual, não evento de
// governança: não entra na auditoria (encheria o feed sem valor).
export async function salvarTema(tema: string): Promise<SalvarTemaResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente.' };

  const parsed = TemaSchema.safeParse(tema);
  if (!parsed.success) return { ok: false, erro: 'Tema inválido.' };

  await prisma.usuario.update({
    where: { id: user.id },
    data: { tema: parsed.data }
  });
  return { ok: true };
}
