import 'server-only';
import { prisma } from './db';
import { metasVisiveisWhere } from './rbac';
import { lembrar } from './cache-memoria';
import { calcPrazoFinal } from './format';
import type { UsuarioSessao } from './session';
import type { AcaoAtrasadaRow } from '@/app/(app)/painel/AcoesAtrasadas';

// ============================================================================
// Dados do painel. A página e a Server Action que carrega a lista de ações em
// atraso sob demanda (actions/painel.ts) usam as mesmas funções, para as
// regras de visibilidade não divergirem.
// ============================================================================

export type MetaPainel = {
  id: string;
  nome: string;
  secretariaDonaId: string;
  divisaoExecutoraId: string;
};

export type AcaoPainel = {
  id: string;
  nome: string;
  metaCPId: string;
  situacaoAtual: number;
  peso: number;
  status: string;
  inicio: string | null;
  prazo: string | null;
  tempoNecessario: string | null;
  responsavelId: string | null;
  ultJustificativa: string | null;
  ultJustQuando: Date | null;
};

// Metas ativas visíveis ao usuário e as ações delas — filtradas no banco, só
// com as colunas usadas pelo painel.
export async function carregarBasePainel(user: UsuarioSessao) {
  const metaWhere = { arquivada: false, ...metasVisiveisWhere(user) };
  const [metas, acoes] = await Promise.all([
    prisma.metaCP.findMany({
      where: metaWhere,
      select: { id: true, nome: true, secretariaDonaId: true, divisaoExecutoraId: true }
    }),
    prisma.acao.findMany({
      where: { metaCP: metaWhere },
      select: {
        id: true, nome: true, metaCPId: true, situacaoAtual: true, peso: true, status: true,
        inicio: true, prazo: true, tempoNecessario: true, responsavelId: true,
        ultJustificativa: true, ultJustQuando: true
      }
    })
  ]);
  return { metas: metas as MetaPainel[], acoes: acoes as AcaoPainel[] };
}

// Secretarias e divisões só mudam pelo seed/banco (nenhuma tela as altera):
// os nomes ficam 5 minutos em memória.
export function carregarNomesOrganizacao() {
  return lembrar('organizacao:nomes', 5 * 60 * 1000, async () => {
    const [secretarias, divisoes] = await Promise.all([
      prisma.secretaria.findMany({ select: { id: true, nome: true } }),
      prisma.divisao.findMany({ select: { id: true, nome: true } })
    ]);
    return {
      secretarias,
      secretariaNome: new Map(secretarias.map(s => [s.id, s.nome])),
      divisaoNome: new Map(divisoes.map(d => [d.id, d.nome]))
    };
  });
}

// ============================================================================
// Situação passada de cada ação (para "vs. 30 dias atrás" e o ranking).
//
// É o último snapshot com `quando` <= corte. Snapshots novos sempre têm a data
// de agora, depois de todos os cortes — então atualizar uma ação NÃO muda
// esses valores; eles só andam com o passar do tempo. Por isso o resultado é
// calculado uma vez para a prefeitura inteira e reaproveitado por 10 minutos
// para todos os usuários (o filtro de visibilidade é aplicado depois, em
// memória). Ações sem snapshot anterior ao corte contam como 0.
// ============================================================================

export const DIAS_CORTE = [30, 60, 90, 180, 360] as const;
export type DiasCorte = (typeof DIAS_CORTE)[number];

const CACHE_SITUACAO_MS = 10 * 60 * 1000;
let cacheSituacao: { expira: number; valor: Promise<Map<string, number[]>> } | null = null;

export function situacoesPassadas(): Promise<Map<string, number[]>> {
  const agora = Date.now();
  if (cacheSituacao && cacheSituacao.expira > agora) return cacheSituacao.valor;

  // A promessa fica no cache: acessos simultâneos esperam a mesma consulta.
  const valor = consultarSituacoesPassadas(agora);
  cacheSituacao = { expira: agora + CACHE_SITUACAO_MS, valor };
  valor.catch(() => { cacheSituacao = null; });
  return valor;
}

async function consultarSituacoesPassadas(agora: number): Promise<Map<string, number[]>> {
  // Colunas DateTime do Prisma são timestamp sem fuso, gravadas em UTC.
  const [c30, c60, c90, c180, c360] = DIAS_CORTE.map(d =>
    new Date(agora - d * 24 * 60 * 60 * 1000).toISOString()
  );
  // Uma busca pelo índice (acaoId, quando) por ação e corte: o custo não
  // cresce com o tamanho do histórico, só com o número de ações.
  const linhas = await prisma.$queryRaw<Array<{ id: string; s: Array<number | null> }>>`
    SELECT x.id, ARRAY[x.s30, x.s60, x.s90, x.s180, x.s360] AS s FROM (
      SELECT a.id,
        (SELECT "situacaoAtual" FROM "AcaoSnapshot" WHERE "acaoId" = a.id AND quando <= ${c30}::timestamp ORDER BY quando DESC LIMIT 1) AS s30,
        (SELECT "situacaoAtual" FROM "AcaoSnapshot" WHERE "acaoId" = a.id AND quando <= ${c60}::timestamp ORDER BY quando DESC LIMIT 1) AS s60,
        (SELECT "situacaoAtual" FROM "AcaoSnapshot" WHERE "acaoId" = a.id AND quando <= ${c90}::timestamp ORDER BY quando DESC LIMIT 1) AS s90,
        (SELECT "situacaoAtual" FROM "AcaoSnapshot" WHERE "acaoId" = a.id AND quando <= ${c180}::timestamp ORDER BY quando DESC LIMIT 1) AS s180,
        (SELECT "situacaoAtual" FROM "AcaoSnapshot" WHERE "acaoId" = a.id AND quando <= ${c360}::timestamp ORDER BY quando DESC LIMIT 1) AS s360
      FROM "Acao" a
    ) x
    WHERE x.s30 IS NOT NULL
  `;
  // Se não há snapshot antes do corte de 30 dias, não há antes de nenhum
  // outro (os cortes seguintes são mais antigos) — a linha é omitida.
  return new Map(linhas.map(l => [l.id, l.s.map(v => v ?? 0)]));
}

// ============================================================================
// Ações em atraso
// ============================================================================

type Responsavel = { id: string; nome: string; perfil: string };

export type AtrasadaClassificada = {
  acao: AcaoPainel;
  meta: MetaPainel | undefined;
  resp: Responsavel | undefined;
  souResponsavel: boolean;
  escopoVisibilidade: boolean;
  podeCobrar: boolean;
  recebiCobranca: boolean;
};

// Decide, sem consultar cobranças, quais ações atrasadas o usuário enxerga e
// o papel dele em cada uma. Barato: serve para o contador do painel.
export async function classificarAtrasadas(
  user: UsuarioSessao,
  atrasadas: AcaoPainel[],
  metaPorId: Map<string, MetaPainel>
): Promise<AtrasadaClassificada[]> {
  if (atrasadas.length === 0) return [];

  const responsavelIds = Array.from(new Set(atrasadas.map(a => a.responsavelId).filter(Boolean) as string[]));
  const responsaveis = responsavelIds.length
    ? await prisma.usuario.findMany({
        where: { id: { in: responsavelIds } },
        select: { id: true, nome: true, perfil: true }
      })
    : [];
  const respMap = new Map(responsaveis.map(r => [r.id, r]));

  const out: AtrasadaClassificada[] = [];
  for (const a of atrasadas) {
    const meta = metaPorId.get(a.metaCPId);
    const resp = a.responsavelId ? respMap.get(a.responsavelId) : undefined;
    const secretariaDonaId = meta?.secretariaDonaId;
    const divisaoExecutoraId = meta?.divisaoExecutoraId;
    const souResponsavel = a.responsavelId === user.id;

    // Escopo de VISIBILIDADE: quem pode ver essa ação no painel além do
    // responsável — inclui o chefe da divisão, que acompanha mas não cobra.
    const escopoVisibilidade =
      user.perfil === 'prefeito' ||
      (user.perfil === 'secretario' && !!secretariaDonaId &&
        user.lotacoes.some(l => l.secretariaId === secretariaDonaId)) ||
      (user.perfil === 'chefe' && !!divisaoExecutoraId &&
        user.lotacoes.some(l => l.divisaoId === divisaoExecutoraId));

    // Escopo de COBRANÇA: só prefeito e o secretário dono. Chefe é a base da
    // hierarquia — não tem subordinado pra cobrar, só responde quando é o
    // próprio cobrado (anexa mensagem via responderCobranca).
    const podeCobrarHierarquia =
      user.perfil === 'prefeito' ||
      (user.perfil === 'secretario' && !!secretariaDonaId &&
        user.lotacoes.some(l => l.secretariaId === secretariaDonaId));
    const podeCobrar = podeCobrarHierarquia && !souResponsavel;

    // Cadeia de notificação de cobranças: quem é notificado quando um superior cobra.
    // - Responsável direto sempre recebe.
    // - Se responsável é chefe → secretário da secretaria também.
    // - Se responsável é secretário → só ele.
    const ehSecretariaDona = user.perfil === 'secretario' && !!secretariaDonaId &&
      user.lotacoes.some(l => l.secretariaId === secretariaDonaId);
    const recebiCobranca = souResponsavel || (ehSecretariaDona && resp?.perfil === 'chefe');

    // Só entram ações que o usuário tem escopo pra ver (prefeito, secretário
    // dono ou chefe da divisão) ou em que está na cadeia de notificação.
    if (!escopoVisibilidade && !recebiCobranca) continue;
    out.push({ acao: a, meta, resp, souResponsavel, escopoVisibilidade, podeCobrar, recebiCobranca });
  }
  return out;
}

// Monta as linhas completas (com cobranças, respostas e comentários) só para
// as ações pedidas. A lista inteira é carregada quando o usuário abre o
// quadro; na abertura do painel, só as cobranças que ele recebeu.
export async function detalharAtrasadas(
  user: UsuarioSessao,
  classificadas: AtrasadaClassificada[],
  nomes: { secretariaNome: Map<string, string>; divisaoNome: Map<string, string> }
): Promise<AcaoAtrasadaRow[]> {
  if (classificadas.length === 0) return [];

  const acaoIds = classificadas.map(c => c.acao.id);
  const campos = { id: true, atorId: true, atorNome: true, perfil: true, quando: true, msg: true, entidadeId: true, parentId: true } as const;

  // Carrega TODAS as cobranças/comentários destas ações (não só as minhas). A
  // visibilidade por linha é decidida no map abaixo, respeitando a hierarquia.
  const [todasCobrancas, todasRespostas, todosComentarios] = await Promise.all([
    prisma.auditoria.findMany({
      where: { entidade: 'acao', entidadeId: { in: acaoIds }, tag: 'ACAO:COBRANCA' },
      orderBy: { quando: 'desc' },
      select: campos
    }),
    prisma.auditoria.findMany({
      where: { entidade: 'acao', entidadeId: { in: acaoIds }, tag: 'ACAO:RESPOSTA_COBRANCA' },
      select: campos
    }),
    prisma.auditoria.findMany({
      where: { entidade: 'acao', entidadeId: { in: acaoIds }, tag: 'ACAO:COMENTARIO' },
      orderBy: { quando: 'desc' },
      select: campos
    })
  ]);

  type Evento = (typeof todasCobrancas)[number];

  // Mapa: cobrançaId → resposta
  const respostaPorCobranca = new Map<string, Evento>();
  for (const r of todasRespostas) {
    if (r.parentId) respostaPorCobranca.set(r.parentId, r);
  }

  const agrupar = (eventos: Evento[]) => {
    const m = new Map<string, Evento[]>();
    for (const e of eventos) {
      const arr = m.get(e.entidadeId);
      if (arr) arr.push(e); else m.set(e.entidadeId, [e]);
    }
    return m;
  };
  const cobrancasPorAcao = agrupar(todasCobrancas);
  const comentariosPorAcao = agrupar(todosComentarios);

  const mapCobrancaInfo = (c: Evento) => {
    const resp = respostaPorCobranca.get(c.id);
    return {
      id: c.id,
      atorId: c.atorId,
      atorNome: c.atorNome,
      atorPerfil: c.perfil,
      quando: c.quando.toISOString(),
      msg: extractMsgExtra(c.msg),
      resposta: resp
        ? { atorNome: resp.atorNome, quando: resp.quando.toISOString(), msg: resp.msg }
        : null
    };
  };

  const rows: AcaoAtrasadaRow[] = classificadas.map(c => {
    const { acao: a, meta, resp } = c;
    const cobrancasDessa = cobrancasPorAcao.get(a.id) ?? [];
    const minhaUltima = cobrancasDessa.find(x => x.atorId === user.id);

    // cobrancasContraMim: cobranças visíveis para quem está na cadeia de notificação
    // (responsável direto OU superior hierárquico), excluindo cobranças feitas pelo próprio.
    const cobrancasContraMim = c.recebiCobranca
      ? cobrancasDessa.filter(x => x.atorId !== user.id).map(mapCobrancaInfo)
      : [];
    const cobrancasGerenciais = c.escopoVisibilidade && !c.recebiCobranca
      ? cobrancasDessa.filter(x => x.atorId !== user.id).map(mapCobrancaInfo)
      : [];

    // Comentário livre: o canal do chefe (e de qualquer um no escopo) pra
    // anexar uma mensagem sem que isso seja uma cobrança.
    const podeComentar = c.escopoVisibilidade || c.souResponsavel;
    const comentarios = (podeComentar ? comentariosPorAcao.get(a.id) ?? [] : [])
      .map(x => ({
        atorNome: x.atorNome,
        atorPerfil: x.perfil,
        quando: x.quando.toISOString(),
        msg: x.msg
      }));

    return {
      id: a.id,
      nome: a.nome,
      metaCPId: a.metaCPId,
      metaCPNome: meta?.nome ?? '—',
      secretariaNome: meta ? nomes.secretariaNome.get(meta.secretariaDonaId) ?? '—' : '—',
      divisaoNome: meta ? nomes.divisaoNome.get(meta.divisaoExecutoraId) ?? '—' : '—',
      responsavelNome: resp?.nome ?? null,
      responsavelPerfil: resp?.perfil ?? null,
      responsavelId: a.responsavelId,
      prazo: a.prazo,
      diasEmAtraso: diasEmAtrasoDerivado(a.inicio, a.tempoNecessario),
      situacaoAtual: a.situacaoAtual,
      ultimaJustificativa: a.ultJustificativa,
      ultJustQuando: a.ultJustQuando ? a.ultJustQuando.toISOString() : null,
      podeCobrar: c.podeCobrar,
      podeComentar,
      comentarios,
      minhaUltimaEm: minhaUltima ? minhaUltima.quando.toISOString() : null,
      cobrancasContraMim,
      cobrancasGerenciais,
      souResponsavel: c.souResponsavel,
      recebiCobranca: c.recebiCobranca,
      escopoVisibilidade: c.escopoVisibilidade
    };
  });

  // Mais atrasados primeiro; ações sem prazo por último.
  rows.sort((x, y) => (y.diasEmAtraso ?? -1) - (x.diasEmAtraso ?? -1));
  return rows;
}

// Dias em atraso derivados de (inicio + máx do tempoNecessario). Positivo quando
// o prazo já venceu; null quando não dá pra calcular (falta inicio ou tempo).
function diasEmAtrasoDerivado(inicio: string | null, tempo: string | null): number | null {
  const prazo = calcPrazoFinal(inicio, tempo);
  if (!prazo) return null;
  const diff = Date.now() - prazo.getTime();
  if (diff <= 0) return null;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

// Extrai só o trecho depois de " — " da msg de auditoria (que é a msg opcional do ator).
function extractMsgExtra(msg: string): string {
  const idx = msg.indexOf(' — ');
  return idx > 0 ? msg.slice(idx + 3).trim() : '';
}
