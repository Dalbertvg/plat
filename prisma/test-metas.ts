/**
 * Metas de teste ("smoke data") para exercitar o Plano de Metas sem sujar o
 * seed principal. Tudo é marcado para remoção fácil:
 *
 *   IDs:
 *     Meta CP:  TEST_META001..010     (prefixo TEST_)
 *     Ação:     test_a_TM001_1..N     (prefixo test_a_)
 *
 *   Nome visível na UI:
 *     Meta CP:  "[TESTE] <nome real>"
 *
 * Uso:
 *   npm run test-metas:add       # popula
 *   npm run test-metas:remove    # apaga só o que este script criou
 *
 * O comando remove também limpa Auditoria e Snapshots vinculados a essas ações
 * (snapshots já cascateiam, mas auditoria não — então é feito manualmente).
 * Nada do seed principal é tocado.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const META_PREFIX = 'TEST_';
const ACAO_PREFIX = 'test_a_';
const NOME_PREFIX = '[TESTE] ';

// Ancoragem temporal — mantém coerência com o seed principal.
const HOJE = new Date('2026-09-19T12:00:00Z');
const DIA_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Metas CP de teste — 10 metas cobrindo diferentes cenários
// ============================================================================
type TesteMetaCP = {
  id: string;
  nome: string;
  metaLPId: string;
  secretariaDonaId: string;
  divisaoExecutoraId: string;
  participantes: string[];
};

const testMetas: TesteMetaCP[] = [
  {
    id: 'TEST_META001',
    nome: 'Ampliar cobertura vacinal em bairros periféricos',
    metaLPId: 'lp_sau', secretariaDonaId: 'sec_sau', divisaoExecutoraId: 'div_sau_vig',
    participantes: []
  },
  {
    id: 'TEST_META002',
    nome: 'Modernizar bibliotecas escolares com acervo digital',
    metaLPId: 'lp_edu', secretariaDonaId: 'sec_edu', divisaoExecutoraId: 'div_edu_ped',
    participantes: []
  },
  {
    id: 'TEST_META003',
    nome: 'Implantar central de videomonitoramento 24h',
    metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm',
    participantes: ['sec_gab']
  },
  {
    id: 'TEST_META004',
    nome: 'Recuperar 200km de calçadas e acessibilidade urbana',
    metaLPId: 'lp_obr', secretariaDonaId: 'sec_obr', divisaoExecutoraId: 'div_obr_eng',
    participantes: []
  },
  {
    id: 'TEST_META005',
    nome: 'Reformular carnê digital do ISS com autoemissão',
    metaLPId: 'lp_fin', secretariaDonaId: 'sec_fin', divisaoExecutoraId: 'div_fin_rec',
    participantes: ['sec_adm']
  },
  {
    id: 'TEST_META006',
    nome: 'Programa Envelhecer Bem: expansão dos Centros de Convivência',
    metaLPId: 'lp_des', secretariaDonaId: 'sec_des', divisaoExecutoraId: 'div_des_pb',
    participantes: ['sec_sau', 'sec_cul']
  },
  {
    id: 'TEST_META007',
    nome: 'Coleta seletiva porta-a-porta em 100% dos bairros',
    metaLPId: 'lp_amb', secretariaDonaId: 'sec_amb', divisaoExecutoraId: 'div_amb_su',
    participantes: ['sec_obr']
  },
  {
    id: 'TEST_META008',
    nome: 'Portal Transparência 2.0 com dados abertos em tempo real',
    metaLPId: 'lp_adm', secretariaDonaId: 'sec_adm', divisaoExecutoraId: 'div_adm_sg',
    participantes: ['sec_fin']
  },
  {
    id: 'TEST_META009',
    nome: 'Requalificar Praça São Januário como espaço cultural',
    metaLPId: 'lp_pla', secretariaDonaId: 'sec_pla', divisaoExecutoraId: 'div_pla_urb',
    participantes: ['sec_cul', 'sec_obr']
  },
  {
    id: 'TEST_META010',
    nome: 'Programa Rota do Café: turismo rural integrado',
    metaLPId: 'lp_rural', secretariaDonaId: 'sec_amb', divisaoExecutoraId: 'div_amb_ag',
    participantes: ['sec_cul']
  }
];

// ============================================================================
// Ações de teste — variedade de estados, pesos, responsáveis e prazos
// (prazo "YYYY-MM" no passado = candidato natural a "em atraso")
// ============================================================================
type TesteAcao = {
  metaId: string;
  nome: string;
  tempo: 'ate_6m' | '7_12m' | '13_24m' | '25_36m' | 'acima_36m';
  sit: number;       // 0..1
  status: 'andamento' | 'atraso' | 'concluida';
  prazo: string;     // "YYYY-MM"
  responsavelId?: string;
};

const PESO_DE: Record<TesteAcao['tempo'], number> = {
  ate_6m: 6, '7_12m': 12, '13_24m': 24, '25_36m': 36, acima_36m: 48
};

// Retorna um "YYYY-MM" a N meses atrás de HOJE. Útil para posicionar o `inicio`
// de forma que o status derivado (inicio + mesesMax) case com o que a ação quer
// simular:
//   - "atraso":     iniciar antes de mesesMax → passou do prazo
//   - "andamento":  iniciar dentro do range → dentro do prazo
//   - "concluida":  qualquer inicio no passado
function mesAtrasadoAtras(offsetMeses: number): string {
  const base = new Date(HOJE);
  base.setMonth(base.getMonth() - offsetMeses);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
}

function inicioParaStatus(tempo: TesteAcao['tempo'], status: TesteAcao['status']): string {
  const mMax = { ate_6m: 6, '7_12m': 12, '13_24m': 24, '25_36m': 36, acima_36m: 48 }[tempo];
  if (status === 'atraso') return mesAtrasadoAtras(mMax + 2);   // 2 meses após vencer
  if (status === 'concluida') return mesAtrasadoAtras(mMax + 1); // já se passou o prazo
  return mesAtrasadoAtras(Math.floor(mMax / 2));                // metade do caminho
}

const testAcoes: TesteAcao[] = [
  // TM001 — Saúde: 4 ações, mescla de estados; 1 atraso pronta pra cobrança
  { metaId: 'TEST_META001', nome: 'Mapear bairros com baixa cobertura', tempo: 'ate_6m',   sit: 1.00, status: 'concluida', prazo: '2026-05', responsavelId: 'u_chefe_ap' },
  { metaId: 'TEST_META001', nome: 'Contratar 12 agentes comunitários',   tempo: '7_12m',    sit: 0.60, status: 'andamento', prazo: '2027-01' },
  { metaId: 'TEST_META001', nome: 'Adquirir estoque extra de imunizantes', tempo: 'ate_6m', sit: 0.30, status: 'atraso',    prazo: '2026-07', responsavelId: 'u_fun_ubs' },
  { metaId: 'TEST_META001', nome: 'Campanhas semanais em todas as UBSs', tempo: '13_24m',   sit: 0.15, status: 'andamento', prazo: '2027-09' },

  // TM002 — Educação: quase toda concluída
  { metaId: 'TEST_META002', nome: 'Levantamento do acervo atual',        tempo: 'ate_6m',   sit: 1.00, status: 'concluida', prazo: '2026-04', responsavelId: 'u_chefe_ped' },
  { metaId: 'TEST_META002', nome: 'Compra de 200 tablets escolares',     tempo: 'ate_6m',   sit: 1.00, status: 'concluida', prazo: '2026-06' },
  { metaId: 'TEST_META002', nome: 'Curso de mediação de leitura para bibliotecárias', tempo: '7_12m', sit: 0.80, status: 'andamento', prazo: '2027-03', responsavelId: 'u_chefe_ped' },

  // TM003 — Segurança: em início, sem atrasos, escopo grande
  { metaId: 'TEST_META003', nome: 'Elaborar edital de licitação (câmeras 4K)', tempo: 'ate_6m', sit: 0.20, status: 'andamento', prazo: '2026-12' },
  { metaId: 'TEST_META003', nome: 'Instalar 80 câmeras nos principais cruzamentos', tempo: '13_24m', sit: 0.10, status: 'andamento', prazo: '2027-12' },
  { metaId: 'TEST_META003', nome: 'Integrar sistema à Guarda Civil e Cetrans', tempo: '7_12m',  sit: 0.15, status: 'andamento', prazo: '2027-06' },

  // TM004 — Obras: pesos altos, mid-progress, 1 atraso sem responsável
  { metaId: 'TEST_META004', nome: 'Diagnóstico técnico das calçadas por bairro', tempo: 'ate_6m', sit: 1.00, status: 'concluida', prazo: '2026-05' },
  { metaId: 'TEST_META004', nome: 'Contratação de empreiteiras (5 lotes)',       tempo: '7_12m',  sit: 0.70, status: 'andamento', prazo: '2027-02' },
  { metaId: 'TEST_META004', nome: 'Executar 200km em 5 lotes simultâneos',       tempo: '25_36m', sit: 0.35, status: 'andamento', prazo: '2028-06' },
  { metaId: 'TEST_META004', nome: 'Rebaixar guias em pontos de acessibilidade',  tempo: '13_24m', sit: 0.20, status: 'atraso',    prazo: '2026-06' /* sem responsavel */ },

  // TM005 — Finanças: mista, com atraso e ação-piloto
  { metaId: 'TEST_META005', nome: 'Especificação técnica do carnê digital', tempo: 'ate_6m', sit: 1.00, status: 'concluida', prazo: '2026-04' },
  { metaId: 'TEST_META005', nome: 'Desenvolvimento do módulo de autoemissão', tempo: '7_12m', sit: 0.50, status: 'andamento', prazo: '2026-11' },
  { metaId: 'TEST_META005', nome: 'Piloto com 500 contribuintes',              tempo: 'ate_6m', sit: 0.10, status: 'atraso',    prazo: '2026-08' },

  // TM006 — Desenvolvimento Social: MUITOS atrasos para estressar o painel de cobrança
  { metaId: 'TEST_META006', nome: 'Identificar imóveis para 3 novos centros', tempo: 'ate_6m', sit: 0.40, status: 'atraso', prazo: '2026-06', responsavelId: 'u_chefe_pb' },
  { metaId: 'TEST_META006', nome: 'Firmar convênio com Ministério da Saúde',    tempo: 'ate_6m', sit: 0.20, status: 'atraso', prazo: '2026-07', responsavelId: 'u_chefe_pb' },
  { metaId: 'TEST_META006', nome: 'Contratar equipe socioassistencial',         tempo: '7_12m',  sit: 0.15, status: 'atraso', prazo: '2026-05', responsavelId: 'u_fun_multi' },
  { metaId: 'TEST_META006', nome: 'Programação cultural mensal nos centros',    tempo: '13_24m', sit: 1.00, status: 'concluida', prazo: '2026-08' },

  // TM007 — Meio ambiente: progresso médio-alto, alto peso agregado
  { metaId: 'TEST_META007', nome: 'Reestruturar rotas dos caminhões coletores', tempo: 'ate_6m', sit: 0.85, status: 'andamento', prazo: '2026-10' },
  { metaId: 'TEST_META007', nome: 'Contratar equipes adicionais de coleta',     tempo: '7_12m',  sit: 0.55, status: 'andamento', prazo: '2027-01' },
  { metaId: 'TEST_META007', nome: 'Campanha educativa nos bairros',             tempo: '13_24m', sit: 0.40, status: 'andamento', prazo: '2027-08' },

  // TM008 — Administração: quase pronta
  { metaId: 'TEST_META008', nome: 'Definir taxonomia de dados abertos',   tempo: 'ate_6m', sit: 1.00, status: 'concluida', prazo: '2026-04' },
  { metaId: 'TEST_META008', nome: 'Publicar 40 datasets prioritários',    tempo: 'ate_6m', sit: 0.90, status: 'andamento', prazo: '2026-10' },
  { metaId: 'TEST_META008', nome: 'Painel visual com atualização diária', tempo: '7_12m',  sit: 0.75, status: 'andamento', prazo: '2027-02' },

  // TM009 — Planejamento: fase inicial (0% em quase tudo — testa "±0%")
  { metaId: 'TEST_META009', nome: 'Projeto arquitetônico e paisagismo',  tempo: 'ate_6m',  sit: 0.05, status: 'andamento', prazo: '2027-01' },
  { metaId: 'TEST_META009', nome: 'Licenciamento junto ao IEPHA',        tempo: '7_12m',   sit: 0.00, status: 'andamento', prazo: '2027-04' },
  { metaId: 'TEST_META009', nome: 'Obra de requalificação',              tempo: '25_36m',  sit: 0.00, status: 'andamento', prazo: '2028-12' },

  // TM010 — Rural: meta 100% concluída (testa "concluída" no painel)
  { metaId: 'TEST_META010', nome: 'Mapeamento dos produtores parceiros', tempo: 'ate_6m', sit: 1.00, status: 'concluida', prazo: '2026-05' },
  { metaId: 'TEST_META010', nome: 'Criação da marca "Rota do Café"',     tempo: 'ate_6m', sit: 1.00, status: 'concluida', prazo: '2026-06' },
  { metaId: 'TEST_META010', nome: 'Roteiro turístico piloto (3 fazendas)', tempo: 'ate_6m', sit: 1.00, status: 'concluida', prazo: '2026-08' }
];

// ============================================================================
// ADD
// ============================================================================
async function add() {
  console.log(`Adicionando ${testMetas.length} metas de teste (prefixo ${META_PREFIX})…`);

  // Se rodar de novo, primeiro limpa o que já foi inserido pra evitar duplicidade.
  await remove({ silent: true });

  for (const m of testMetas) {
    await prisma.metaCP.create({
      data: {
        id: m.id,
        nome: NOME_PREFIX + m.nome,
        metaLPId: m.metaLPId,
        secretariaDonaId: m.secretariaDonaId,
        divisaoExecutoraId: m.divisaoExecutoraId
      }
    });
    for (const secId of m.participantes) {
      await prisma.metaCPParticipante.create({
        data: { metaCPId: m.id, secretariaId: secId }
      });
    }
  }

  // Grupos por meta para gerar IDs sequenciais legíveis: test_a_TM001_1..N
  const contador: Record<string, number> = {};
  let totalAcoes = 0;
  for (const a of testAcoes) {
    const short = a.metaId.replace('TEST_META', 'TM');
    contador[short] = (contador[short] ?? 0) + 1;
    const id = `${ACAO_PREFIX}${short}_${contador[short]}`;
    const peso = PESO_DE[a.tempo];

    // Início derivado do status desejado — assim o "status derivado" (que hoje
    // manda no painel) casa com o cenário que a linha quer simular.
    const inicio = inicioParaStatus(a.tempo, a.status);

    await prisma.acao.create({
      data: {
        id,
        metaCPId: a.metaId,
        nome: a.nome,
        peso,
        tempoNecessario: a.tempo,
        alvo: 1.0, unidade: '%',
        situacaoAtual: a.sit,
        status: a.status,
        inicio,
        prazo: a.prazo,
        responsavelId: a.responsavelId ?? null
      }
    });

    // Snapshots simulando crescimento gradual — dão delta em todas as janelas do painel
    const cortes: Array<{ diasAtras: number; fator: number }> = [
      { diasAtras: 360, fator: 0.00 },
      { diasAtras: 180, fator: 0.20 },
      { diasAtras: 90,  fator: 0.35 },
      { diasAtras: 60,  fator: 0.50 },
      { diasAtras: 30,  fator: 0.70 },
      { diasAtras: 0,   fator: 1.00 }
    ];
    for (const c of cortes) {
      const quando = new Date(HOJE.getTime() - c.diasAtras * DIA_MS);
      const valor = Math.max(0, Math.min(1, a.sit * c.fator));
      await prisma.acaoSnapshot.create({
        data: { acaoId: id, situacaoAtual: valor, peso, quando }
      });
    }

    totalAcoes++;
  }

  console.log(`  ✓ ${testMetas.length} metas`);
  console.log(`  ✓ ${totalAcoes} ações`);
  console.log(`  ✓ ${totalAcoes * 6} snapshots (6 cortes: 360d, 180d, 90d, 60d, 30d, hoje)`);
  console.log(`\nPara remover: npm run test-metas:remove`);
}

// ============================================================================
// REMOVE — apaga apenas o que este script criou
// ============================================================================
async function remove(opts: { silent?: boolean } = {}) {
  const log = opts.silent ? (..._args: unknown[]) => {} : console.log;

  const metas = await prisma.metaCP.findMany({
    where: { id: { startsWith: META_PREFIX } },
    select: { id: true }
  });
  const acoes = await prisma.acao.findMany({
    where: { id: { startsWith: ACAO_PREFIX } },
    select: { id: true }
  });

  if (metas.length === 0 && acoes.length === 0) {
    log('Nada de teste encontrado — banco já está limpo.');
    return;
  }

  const acaoIds = acoes.map(a => a.id);
  const metaIds = metas.map(m => m.id);

  // 1) Auditoria referenciando ações de teste (cobranças, updates etc.)
  const auditAcao = await prisma.auditoria.deleteMany({
    where: { entidade: 'acao', entidadeId: { in: acaoIds } }
  });
  // 2) Auditoria referenciando metas de teste
  const auditMeta = await prisma.auditoria.deleteMany({
    where: { entidade: { in: ['meta', 'metacp'] }, entidadeId: { in: metaIds } }
  });
  // 3) Ações (snapshots cascateiam)
  const delAcoes = await prisma.acao.deleteMany({
    where: { id: { startsWith: ACAO_PREFIX } }
  });
  // 4) Participantes de metas cascateiam com a meta
  const delMetas = await prisma.metaCP.deleteMany({
    where: { id: { startsWith: META_PREFIX } }
  });

  log(`Removido:`);
  log(`  ✓ ${delMetas.count} metas`);
  log(`  ✓ ${delAcoes.count} ações (snapshots cascateados)`);
  log(`  ✓ ${auditAcao.count + auditMeta.count} entradas de auditoria`);
}

// ============================================================================
// CLI
// ============================================================================
const cmd = process.argv[2];

async function run() {
  if (cmd === 'add') {
    await add();
  } else if (cmd === 'remove') {
    await remove();
  } else {
    console.log('Uso: tsx prisma/test-metas.ts [add|remove]');
    console.log('');
    console.log('  add     Popula 10 metas de teste + ações + snapshots.');
    console.log('  remove  Apaga apenas o que o "add" criou (prefixos TEST_ e test_a_).');
    process.exit(1);
  }
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
