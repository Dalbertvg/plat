// ============================================================================
// RBAC — Rev. 3.0
//
// Fluxo hierárquico obrigatório: Chefe → Secretário → Publicado.
// Múltiplas lotações resolvem pela regra da UNIÃO: prevalece o maior nível
// concedido por qualquer lotação do usuário.
// ============================================================================

export type Perfil = 'prefeito' | 'secretario' | 'chefe';

export type Lotacao = { secretariaId: string; divisaoId: string | null };

export type UserContext = {
  id: string;
  perfil: Perfil;
  lotacoes: Lotacao[];
};

export type MetaTarget = {
  secretariaDonaId?: string;
  divisaoExecutoraId?: string;
};

export type AcaoTarget = MetaTarget & {
  responsavelId?: string | null;
};

export type PropostaTarget = {
  divisaoOrigemId?: string | null;
  secretariaDonaId?: string;
};

// Read scope: quais secretárias o usuário pode LER?
// Secretário vê apenas as suas; panorama completo é exclusivo do prefeito.
export function readableSecretariasOf(u: UserContext, allSecIds: string[]): Set<string> {
  if (u.perfil === 'prefeito') return new Set(allSecIds);
  return new Set(u.lotacoes.map(l => l.secretariaId));
}

// Filtra metas visíveis: além das que pertencem à secretaria do usuário,
// inclui metas em que a secretaria do usuário é participante (meta conjunta).
export function filterVisibleMetas<M extends { secretariaDonaId: string; id: string }>(
  u: UserContext,
  metas: M[],
  participantes: Array<{ metaCPId: string; secretariaId: string }>
): M[] {
  if (u.perfil === 'prefeito') return metas;
  const minhasSecIds = new Set(u.lotacoes.map(l => l.secretariaId));
  const metasConjuntas = new Set(
    participantes
      .filter(p => minhasSecIds.has(p.secretariaId))
      .map(p => p.metaCPId)
  );
  return metas.filter(m => minhasSecIds.has(m.secretariaDonaId) || metasConjuntas.has(m.id));
}

// Write scope: quais secretárias o usuário pode ALTERAR direto?
export function writableSecretariasOf(u: UserContext, allSecIds: string[]): Set<string> {
  if (u.perfil === 'prefeito') return new Set(allSecIds);
  return new Set(u.lotacoes.map(l => l.secretariaId));
}

// Write scope de divisão: para chefes/funcionários com múltiplas lotações, união.
export function writableDivisoesOf(u: UserContext): Set<string> {
  const s = new Set<string>();
  for (const l of u.lotacoes) if (l.divisaoId) s.add(l.divisaoId);
  return s;
}

export type Action =
  | 'meta.create'
  | 'meta.edit'
  | 'meta.delete'
  | 'meta.reassign'
  | 'acao.edit'
  | 'acao.updateSituacao'
  | 'proposta.submit'
  | 'proposta.approveAsChefe'
  | 'proposta.approveAsSecretario'
  | 'proposta.approveAsPrefeito'
  | 'user.manageGlobal'
  | 'user.manageSecretaria';

export function can(u: UserContext, action: Action, target?: MetaTarget & AcaoTarget & PropostaTarget): boolean {
  const t = target ?? {};

  switch (action) {
    case 'user.manageGlobal':
      return u.perfil === 'prefeito';

    case 'user.manageSecretaria':
      return u.perfil === 'prefeito' ||
        (u.perfil === 'secretario' && u.lotacoes.some(l => l.secretariaId === t.secretariaDonaId));

    case 'meta.create':
      if (u.perfil === 'prefeito') return true;
      if (u.perfil === 'secretario' && t.secretariaDonaId)
        return u.lotacoes.some(l => l.secretariaId === t.secretariaDonaId);
      return false;

    case 'meta.edit':
    case 'meta.delete':
      if (u.perfil === 'prefeito') return true;
      if (u.perfil === 'secretario' && t.secretariaDonaId)
        return u.lotacoes.some(l => l.secretariaId === t.secretariaDonaId);
      return false;

    case 'meta.reassign':
      return u.perfil === 'prefeito';

    case 'acao.edit':
      if (u.perfil === 'prefeito') return true;
      if (u.perfil === 'secretario' && t.secretariaDonaId)
        return u.lotacoes.some(l => l.secretariaId === t.secretariaDonaId);
      if (u.perfil === 'chefe' && t.divisaoExecutoraId)
        return u.lotacoes.some(l => l.divisaoId === t.divisaoExecutoraId);
      return false;

    case 'acao.updateSituacao':
      if (u.perfil === 'prefeito') return true;
      if (u.perfil === 'secretario' && t.secretariaDonaId)
        return u.lotacoes.some(l => l.secretariaId === t.secretariaDonaId);
      if (u.perfil === 'chefe' && t.divisaoExecutoraId)
        return u.lotacoes.some(l => l.divisaoId === t.divisaoExecutoraId);
      // fallback: quem é o responsável direto pela ação pode atualizar sua situação
      // mesmo fora do escopo de lotação (ex.: responsável emprestado de outra divisão).
      return t.responsavelId === u.id;

    case 'proposta.submit':
      return u.perfil !== 'prefeito';

    // Prefeito NÃO pula etapa: cada nível aprova (ou rejeita) por conta própria
    // antes de a proposta subir. O prefeito só age quando `proximoRevisor`
    // chega nele (ver 'proposta.approveAsPrefeito').
    case 'proposta.approveAsChefe':
      if (u.perfil === 'chefe' && t.divisaoOrigemId)
        return u.lotacoes.some(l => l.divisaoId === t.divisaoOrigemId);
      return false;

    case 'proposta.approveAsSecretario':
      if (u.perfil === 'secretario' && t.secretariaDonaId)
        return u.lotacoes.some(l => l.secretariaId === t.secretariaDonaId);
      return false;

    case 'proposta.approveAsPrefeito':
      return u.perfil === 'prefeito';
  }
}

// ============================================================================
// Enforcement helper — lança se não puder.
// ============================================================================
export class RBACError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RBACError';
  }
}

export function requireCan(u: UserContext, action: Action, target?: MetaTarget & AcaoTarget & PropostaTarget) {
  if (!can(u, action, target)) {
    throw new RBACError(`Ação não permitida no seu perfil: ${action}`);
  }
}

// Quem pode comentar na conversa de uma proposta: o autor, o chefe da divisão
// de origem, o secretário da secretaria dona, e o prefeito — basicamente
// qualquer um que já enxerga a proposta na fila de decisão dela (não só quem
// é o revisor NO MOMENTO).
export function podeComentarProposta(
  user: UserContext,
  p: { autorId: string; secretariaDonaId: string; divisaoOrigemId: string | null }
): boolean {
  if (user.perfil === 'prefeito') return true;
  if (user.id === p.autorId) return true;
  if (user.perfil === 'secretario' && user.lotacoes.some(l => l.secretariaId === p.secretariaDonaId)) return true;
  if (user.perfil === 'chefe' && p.divisaoOrigemId && user.lotacoes.some(l => l.divisaoId === p.divisaoOrigemId)) return true;
  return false;
}

// ============================================================================
// Próximo revisor no fluxo hierárquico
//
// Regra geral (sobe um nível na hierarquia da secretaria dona da proposta):
//   chefe       → secretário da secretaria dona
//   secretário  → prefeito, MAS somente se ele é dono da secretaria alvo;
//                 caso contrário, encaminha ao secretário dono (não bypass!)
//   prefeito    → não submete
// ============================================================================
export function proximoRevisorDe(
  autor: UserContext,
  secretariaDonaId: string
): 'chefe' | 'secretario' | 'prefeito' {
  if (autor.perfil === 'chefe') return 'secretario';
  if (autor.perfil === 'secretario') {
    const eDono = autor.lotacoes.some(l => l.secretariaId === secretariaDonaId);
    return eDono ? 'prefeito' : 'secretario';
  }
  // prefeito não submete propostas — mas por robustez:
  return 'prefeito';
}
