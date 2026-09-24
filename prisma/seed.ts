import { PrismaClient } from '@prisma/client';
import { gerarSenhaInicial, hashSenha, SENHA_MAX_BYTES } from '../src/lib/senha';

const prisma = new PrismaClient();

// --producao: executado a cada start na hospedagem (ver render.yaml). Só age
// em banco vazio e cria o organograma, as metas reais do plano de governo e UM
// login (prefeito) com a senha de SENHA_INICIAL_ADMIN. Não cria o progresso
// simulado das ações e nunca imprime senhas — iriam parar nos logs.
const PRODUCAO = process.argv.includes('--producao');

// ============================================================================
// Dados extraídos do organograma oficial de Ubá-MG e do Plano de Governo 2025-2028.
//
// Estado atual do seed (reset de 2026-09): o organograma completo (secretarias,
// divisões, usuários e lotações) é mantido, mas as metas/ações só foram
// repopuladas para a Secretaria de Segurança Pública e Mobilidade Urbana —
// as demais secretarias ficam sem metas até que o conteúdo real do plano de
// governo para elas seja levantado. Não há mais o perfil "funcionário": a
// hierarquia de trabalho passou a ser só chefe → secretário → prefeito.
// ============================================================================

const secretarias = [
  { id: 'sec_gab', nome: 'Gabinete do Prefeito', titular: 'José Domiciano Soares Júnior', tipo: 'gabinete' },
  { id: 'sec_adm', nome: 'Secretaria de Administração', titular: 'Guilherme Lopes de Carvalho' },
  { id: 'sec_amb', nome: 'Agricultura e Meio Ambiente', titular: 'Salomão Junior Curi' },
  { id: 'sec_cul', nome: 'Cultura, Turismo e Lazer', titular: 'Alessandra Labanca Garcia' },
  { id: 'sec_des', nome: 'Desenvolvimento Social', titular: 'Ana Paula Teixeira Graciliano' },
  { id: 'sec_edu', nome: 'Educação', titular: 'Adriana Lucarelli Lavorato Souza' },
  { id: 'sec_fin', nome: 'Finanças', titular: 'Rodrigo da Silva Ferreira' },
  { id: 'sec_obr', nome: 'Obras', titular: 'Edeir Pacheco' },
  { id: 'sec_pla', nome: 'Planejamento e Desenvolvimento Sustentável', titular: 'Antônio Geraldo Alves' },
  { id: 'sec_sau', nome: 'Saúde', titular: 'Paulo Vitor da Costa' },
  { id: 'sec_seg', nome: 'Segurança Pública e Mobilidade Urbana', titular: 'Rômulo Silva Rodrigues' },
  { id: 'sec_esp', nome: 'Esportes', titular: 'Antônio Queiroz Junior' }
];

const divisoes = [
  { id: 'div_gab_ctrl', nome: 'Controladoria e Auditoria Interna', secretariaId: 'sec_gab' },
  { id: 'div_gab_proc', nome: 'Procuradoria Geral do Município', secretariaId: 'sec_gab' },
  { id: 'div_gab_ouv', nome: 'Ouvidoria Geral', secretariaId: 'sec_gab' },
  { id: 'div_gab_pje', nome: 'Projetos Estratégicos', secretariaId: 'sec_gab' },
  { id: 'div_adm_cpl', nome: 'Compras e Licitações', secretariaId: 'sec_adm' },
  { id: 'div_adm_gp', nome: 'Gestão de Pessoas', secretariaId: 'sec_adm' },
  { id: 'div_adm_sg', nome: 'Serviços Gerais (TI)', secretariaId: 'sec_adm' },
  { id: 'div_amb_ag', nome: 'Agricultura e Desenvolvimento Rural', secretariaId: 'sec_amb' },
  { id: 'div_amb_su', nome: 'Serviços Urbanos', secretariaId: 'sec_amb' },
  { id: 'div_amb_fis', nome: 'Fiscalização Ambiental, Obras e Posturas', secretariaId: 'sec_amb' },
  { id: 'div_amb_mob', nome: 'Mobilidade e Transporte Público', secretariaId: 'sec_amb' },
  { id: 'div_cul_pat', nome: 'Cultura e Patrimônio Histórico', secretariaId: 'sec_cul' },
  { id: 'div_cul_esj', nome: 'Esportes e Juventude', secretariaId: 'sec_cul' },
  { id: 'div_des_pb', nome: 'Proteção Social Básica', secretariaId: 'sec_des' },
  { id: 'div_des_pe', nome: 'Proteção Social Especial', secretariaId: 'sec_des' },
  { id: 'div_des_hab', nome: 'Política Habitacional', secretariaId: 'sec_des' },
  { id: 'div_edu_adm', nome: 'Administração Escolar', secretariaId: 'sec_edu' },
  { id: 'div_edu_ped', nome: 'Apoio Pedagógico', secretariaId: 'sec_edu' },
  { id: 'div_edu_plan', nome: 'Planejamento e Gestão da Educação', secretariaId: 'sec_edu' },
  { id: 'div_fin_cont', nome: 'Contabilidade', secretariaId: 'sec_fin' },
  { id: 'div_fin_gf', nome: 'Gestão Financeira', secretariaId: 'sec_fin' },
  { id: 'div_fin_rec', nome: 'Receita e Fiscalização Tributária', secretariaId: 'sec_fin' },
  { id: 'div_obr_eng', nome: 'Engenharia e Obras Públicas', secretariaId: 'sec_obr' },
  { id: 'div_obr_tra', nome: 'Transporte e Oficinas', secretariaId: 'sec_obr' },
  { id: 'div_obr_san', nome: 'Saneamento Básico', secretariaId: 'sec_obr' },
  { id: 'div_pla_urb', nome: 'Gestão Urbanística e Desenvolvimento Territorial', secretariaId: 'sec_pla' },
  { id: 'div_pla_reg', nome: 'Regularização e Desenvolvimento Sustentável', secretariaId: 'sec_pla' },
  { id: 'div_pla_orc', nome: 'Gestão Orçamentária', secretariaId: 'sec_pla' },
  { id: 'div_pla_con', nome: 'Convênios', secretariaId: 'sec_pla' },
  { id: 'div_sau_vig', nome: 'Vigilância em Saúde', secretariaId: 'sec_sau' },
  { id: 'div_sau_pla', nome: 'Planejamento e Gestão de Saúde', secretariaId: 'sec_sau' },
  { id: 'div_sau_log', nome: 'Gestão Administrativa, Logística e Suprimentos', secretariaId: 'sec_sau' },
  { id: 'div_sau_ap', nome: 'Atenção Primária em Saúde', secretariaId: 'sec_sau' },
  { id: 'div_seg_gcm', nome: 'Guarda Civil Municipal', secretariaId: 'sec_seg' },
  { id: 'div_seg_mob', nome: 'Mobilidade e Transporte Público', secretariaId: 'sec_seg' },
  { id: 'div_seg_dc', nome: 'Defesa Civil', secretariaId: 'sec_seg' },
  { id: 'div_esp_esj', nome: 'Esportes e Juventude', secretariaId: 'sec_esp' }
];

// Hierarquia de trabalho: prefeito → secretário → chefe (sem nível "funcionário").
const usuarios = [
  { id: 'u_damato', nome: 'José Damato Neto', email: 'prefeito@uba.mg.gov.br', perfil: 'prefeito', lotacoes: [['sec_gab', null]] },
  { id: 'u_glc', nome: 'Guilherme Lopes de Carvalho', email: 'sec.adm@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_adm', null]] },
  { id: 'u_scur', nome: 'Salomão Junior Curi', email: 'sec.amb@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_amb', null]] },
  { id: 'u_alab', nome: 'Alessandra Labanca Garcia', email: 'sec.cul@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_cul', null]] },
  { id: 'u_apt', nome: 'Ana Paula Teixeira Graciliano', email: 'sec.des@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_des', null]] },
  { id: 'u_alv', nome: 'Adriana Lucarelli Lavorato Souza', email: 'sec.edu@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_edu', null]] },
  { id: 'u_rsf', nome: 'Rodrigo da Silva Ferreira', email: 'sec.fin@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_fin', null]] },
  { id: 'u_edp', nome: 'Edeir Pacheco', email: 'sec.obr@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_obr', null]] },
  { id: 'u_aga', nome: 'Antônio Geraldo Alves', email: 'sec.pla@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_pla', null]] },
  { id: 'u_pvc', nome: 'Paulo Vitor da Costa', email: 'sec.sau@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_sau', null]] },
  { id: 'u_rsr', nome: 'Rômulo Silva Rodrigues', email: 'sec.seg@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_seg', null]] },
  { id: 'u_aqj', nome: 'Antônio Queiroz Junior', email: 'sec.esp@uba.mg.gov.br', perfil: 'secretario', lotacoes: [['sec_esp', null]] },
  { id: 'u_chefe_ap', nome: 'Renata Vieira', email: 'r.vieira@uba.mg.gov.br', perfil: 'chefe', lotacoes: [['sec_sau', 'div_sau_ap']] },
  { id: 'u_chefe_ped', nome: 'Marcelo Toledo', email: 'm.toledo@uba.mg.gov.br', perfil: 'chefe', lotacoes: [['sec_edu', 'div_edu_ped']] },
  { id: 'u_chefe_pb', nome: 'Lúcia Fernández', email: 'l.fernandez@uba.mg.gov.br', perfil: 'chefe', lotacoes: [['sec_des', 'div_des_pb']] },
  // Ex-"funcionários" — migrados para chefe nas mesmas lotações (nível único de execução).
  { id: 'u_fun_ubs', nome: 'Carlos Mendonça', email: 'c.mendonca@uba.mg.gov.br', perfil: 'chefe', lotacoes: [['sec_sau', 'div_sau_ap']] },
  { id: 'u_fun_multi', nome: 'Beatriz Rocha', email: 'b.rocha@uba.mg.gov.br', perfil: 'chefe', lotacoes: [['sec_des', 'div_des_pb'], ['sec_sau', 'div_sau_vig']] }
] as const;

// Metas de longo prazo — só os capítulos de Segurança Pública/Defesa Civil (4/16)
// e Mobilidade Urbana (12) do Plano de Governo 2025-2028 de Ubá foram
// repopulados até o momento; as demais secretarias aguardam levantamento do
// conteúdo real do plano de governo.
const metasLP = [
  { id: 'lp_seg', capitulo: '04/16', titulo: 'Fortalecer segurança pública e defesa civil', secretariaDonaId: 'sec_seg' },
  { id: 'lp_mob', capitulo: '12', titulo: 'Garantir mobilidade urbana segura e acessível', secretariaDonaId: 'sec_seg' }
];

// Metas de curto prazo — TODAS as propostas dos capítulos 4.1 (Segurança),
// 16.1 (Defesa Civil) e 12.1 (Mobilidade Urbana) do "PLANO DE GOVERNO -UBÁ-
// FINAL.pdf", uma a uma. Todas marcadas "principal" (compromisso do plano de
// governo, não uma meta secundária criada depois).
const metasCP = [
  // ---- 4.1 Propostas para segurança (14) — divisão: Guarda Civil Municipal ----
  { id: 'META013', nome: 'Instalar monitoramento com câmeras integradas ao Córtex', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: ['sec_gab'] },
  { id: 'META014', nome: 'Criar Patrulha Municipal Rural', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: ['sec_amb'] },
  { id: 'META015', nome: 'Reduzir homicídios e crimes contra o patrimônio em Ubá', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META016', nome: 'Treinar e equipar a Guarda Civil Municipal (GCM)', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META017', nome: 'Implantar patrulhamento escolar (Patrulha de Atenção Imediata — PAI)', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: ['sec_edu'] },
  { id: 'META018', nome: 'Integrar ações de Segurança Pública e Assistência Social', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: ['sec_des'] },
  { id: 'META019', nome: 'Elaborar o Plano Municipal de Segurança', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META020', nome: 'Expandir o projeto Olho Vivo com câmeras inteligentes', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META021', nome: 'Ampliar parcerias com Judiciário, Ministério Público, Defensoria e OAB', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META022', nome: 'Ampliar parcerias com Polícia Militar, Civil, Penal, Bombeiros e Polícia Federal', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META023', nome: 'Apoiar e revitalizar o Conselho Municipal de Segurança Pública (COMSEP)', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META024', nome: 'Ampliar o efetivo da Guarda Civil Municipal', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META025', nome: 'Transferir a sede de comando da Guarda Municipal para a Praça Guido', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },
  { id: 'META026', nome: 'Criar o programa de Proteção Ativa aos comerciantes de Ubá', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_gcm', participantes: [] },

  // ---- 16.1 Propostas para Defesa Civil (6) — divisão: Defesa Civil ----
  { id: 'META027', nome: 'Estruturar a Defesa Civil Municipal para respostas imediatas', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_dc', participantes: [] },
  { id: 'META028', nome: 'Adquirir equipamentos e veículos para a Defesa Civil', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_dc', participantes: [] },
  { id: 'META029', nome: 'Capacitar os profissionais da Defesa Civil', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_dc', participantes: [] },
  { id: 'META030', nome: 'Reestruturar o Conselho e o Fundo Municipal de Defesa Civil', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_dc', participantes: [] },
  { id: 'META031', nome: 'Planejar obras preventivas contra desastres naturais', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_dc', participantes: ['sec_obr'] },
  { id: 'META032', nome: 'Revisar o Plano de Contingência do município', tipo: 'principal', metaLPId: 'lp_seg', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_dc', participantes: [] },

  // ---- 12.1 Propostas para Mobilidade Urbana (11) — divisão: Mobilidade e Transporte Público ----
  { id: 'META033', nome: 'Ampliar as linhas de ônibus para atender todos os bairros', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META034', nome: 'Reduzir acidentes de trânsito com motociclistas, ciclistas e pedestres', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META035', nome: 'Planejar o uso das vias urbanas para melhorar o fluxo no centro', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: ['sec_pla'] },
  { id: 'META036', nome: 'Estudar a viabilidade de bebedouros públicos', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META037', nome: 'Adequar a estrutura urbana para pessoas com mobilidade reduzida', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: ['sec_obr'] },
  { id: 'META038', nome: 'Criar mecanismos de gestão de trânsito para veículos pesados', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META039', nome: 'Incentivar e melhorar a qualidade do transporte público coletivo', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META040', nome: 'Construir ciclovias e incentivar o uso de bicicletas', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META041', nome: 'Criar o Projeto Cidade Educativa de segurança no trânsito', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: ['sec_edu'] },
  { id: 'META042', nome: 'Manter a sinalização horizontal e vertical das vias', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] },
  { id: 'META043', nome: 'Implantar faixas de pedestres e faixas de pedestres elevadas', tipo: 'principal', metaLPId: 'lp_mob', secretariaDonaId: 'sec_seg', divisaoExecutoraId: 'div_seg_mob', participantes: [] }
];

// Ações — simulação de "metade do mandato 2025-2028": ~60% das 31 metas já
// concluídas (todas as ações a 100%), o resto em andamento ou com atraso
// (datas passadas o suficiente para vencer o prazo calculado), com pesos e
// prazos plausíveis por ação. Cronograma inventado para dar textura à
// demonstração — a secretaria ajusta os números reais pela tela de edição.
type Acao = { metaCPId: string; nome: string; peso: number; sit: number; status: string; inicio: string; prazo: string; responsavelId?: string };
const acoes: Acao[] = [
  // META013 — já existia, mantido como estava (~58% andamento)
  { metaCPId: 'META013', nome: 'Elaborar edital de licitação', peso: 2, sit: 1.0, status: 'concluida', inicio: '2026-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META013', nome: 'Instalar 50 câmeras estratégicas', peso: 5, sit: 0.4, status: 'andamento', inicio: '2026-05-01', prazo: '13 a 24 meses' },
  { metaCPId: 'META013', nome: 'Integrar ao sistema Córtex', peso: 3, sit: 0.6, status: 'andamento', inicio: '2026-06-01', prazo: '7 a 12 meses' },

  // META014 — Patrulha Municipal Rural (concluída)
  { metaCPId: 'META014', nome: 'Definir efetivo e viaturas da patrulha rural', peso: 4, sit: 1.0, status: 'concluida', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META014', nome: 'Mapear rotas e pontos críticos na zona rural', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META014', nome: 'Iniciar a operação da Patrulha Municipal Rural', peso: 5, sit: 1.0, status: 'concluida', inicio: '2025-05-01', prazo: '7 a 12 meses' },

  // META015 — Reduzir homicídios e crimes patrimoniais (concluída)
  { metaCPId: 'META015', nome: 'Mapear pontos críticos de criminalidade em Ubá', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META015', nome: 'Intensificar o policiamento ostensivo nas áreas prioritárias', peso: 5, sit: 1.0, status: 'concluida', inicio: '2025-04-01', prazo: '7 a 12 meses' },

  // META016 — Treinar e equipar a GCM (concluída)
  { metaCPId: 'META016', nome: 'Adquirir viaturas, coletes e armamento não-letal para a GCM', peso: 4, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META016', nome: 'Promover curso de educação continuada para os GCMs', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-06-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META016', nome: 'Estruturar plano de valorização do profissional de segurança', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-08-01', prazo: '7 a 12 meses' },

  // META017 — Patrulhamento escolar / PAI (andamento)
  { metaCPId: 'META017', nome: 'Mapear as escolas prioritárias para o patrulhamento', peso: 3, sit: 0.45, status: 'andamento', inicio: '2026-02-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META017', nome: 'Implantar a Patrulha de Atenção Imediata (PAI) nas escolas', peso: 3, sit: 0.45, status: 'andamento', inicio: '2026-04-01', prazo: '13 a 24 meses' },

  // META018 — Integrar Segurança Pública e Assistência Social (concluída)
  { metaCPId: 'META018', nome: 'Desenhar o fluxo integrado entre GCM e Assistência Social', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META018', nome: 'Capacitar equipes para atuação em rede', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-05-01', prazo: '7 a 12 meses' },

  // META019 — Plano Municipal de Segurança (concluída)
  { metaCPId: 'META019', nome: 'Diagnosticar a situação atual de segurança do município', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META019', nome: 'Redigir e publicar o Plano Municipal de Segurança', peso: 4, sit: 1.0, status: 'concluida', inicio: '2025-04-01', prazo: '7 a 12 meses' },

  // META020 — Expandir o Olho Vivo (andamento)
  { metaCPId: 'META020', nome: 'Elaborar edital para novas câmeras inteligentes', peso: 3, sit: 0.35, status: 'andamento', inicio: '2026-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META020', nome: 'Integrar novas câmeras aos bancos de dados existentes', peso: 4, sit: 0.35, status: 'andamento', inicio: '2026-05-01', prazo: '13 a 24 meses' },

  // META021 — Parcerias Judiciário/MP/Defensoria/OAB (concluída)
  { metaCPId: 'META021', nome: 'Firmar convênios com Judiciário, MP, Defensoria e OAB', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META021', nome: 'Estabelecer agenda permanente de reuniões institucionais', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-06-01', prazo: 'Até 6 meses' },

  // META022 — Parcerias PM/Civil/Penal/Bombeiros/PF (concluída)
  { metaCPId: 'META022', nome: 'Renovar convênios com PM, Polícia Civil e Polícia Federal', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META022', nome: 'Estruturar operações conjuntas com o Corpo de Bombeiros', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-07-01', prazo: '7 a 12 meses' },

  // META023 — COMSEP (atraso)
  { metaCPId: 'META023', nome: 'Convocar nova composição do COMSEP', peso: 2, sit: 0.2, status: 'atraso', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META023', nome: 'Revitalizar o regimento e o funcionamento do conselho', peso: 3, sit: 0.2, status: 'atraso', inicio: '2025-03-01', prazo: '7 a 12 meses' },

  // META024 — Ampliar efetivo da GCM (andamento)
  { metaCPId: 'META024', nome: 'Abrir concurso público para novos GCMs', peso: 4, sit: 0.5, status: 'andamento', inicio: '2026-01-01', prazo: '13 a 24 meses' },
  { metaCPId: 'META024', nome: 'Ampliar o quadro conforme disponibilidade orçamentária', peso: 3, sit: 0.5, status: 'andamento', inicio: '2026-02-01', prazo: '13 a 24 meses' },

  // META025 — Transferir sede de comando (atraso)
  { metaCPId: 'META025', nome: 'Levantar as condições do prédio na Praça Guido', peso: 2, sit: 0.15, status: 'atraso', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META025', nome: 'Executar a mudança de sede da Guarda Municipal', peso: 4, sit: 0.15, status: 'atraso', inicio: '2025-04-01', prazo: '7 a 12 meses' },

  // META026 — Proteção Ativa aos comerciantes (concluída)
  { metaCPId: 'META026', nome: 'Cadastrar comerciantes interessados no programa', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-04-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META026', nome: 'Lançar o programa de Proteção Ativa aos comerciantes', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-06-01', prazo: '7 a 12 meses' },

  // META027 — Estruturar a Defesa Civil (concluída)
  { metaCPId: 'META027', nome: 'Levantar necessidades estruturais da Defesa Civil', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META027', nome: 'Estruturar sede e equipe própria da Defesa Civil', peso: 4, sit: 1.0, status: 'concluida', inicio: '2025-04-01', prazo: '7 a 12 meses' },

  // META028 — Equipamentos e veículos (concluída)
  { metaCPId: 'META028', nome: 'Elaborar edital de compra de equipamentos e veículos', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META028', nome: 'Entregar os veículos e equipamentos à Defesa Civil', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-08-01', prazo: 'Até 6 meses' },

  // META029 — Capacitar profissionais da Defesa Civil (concluída)
  { metaCPId: 'META029', nome: 'Definir grade de capacitação para os agentes', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META029', nome: 'Realizar os treinamentos com os profissionais da Defesa Civil', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-05-01', prazo: '7 a 12 meses' },

  // META030 — Conselho e Fundo Municipal de Defesa Civil (concluída)
  { metaCPId: 'META030', nome: 'Reestruturar o Conselho Municipal de Defesa Civil', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META030', nome: 'Criar o Fundo Municipal de enfrentamento a desastres', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-06-01', prazo: '7 a 12 meses' },

  // META031 — Obras preventivas (andamento)
  { metaCPId: 'META031', nome: 'Mapear áreas de risco de enchentes e deslizamentos', peso: 3, sit: 0.4, status: 'andamento', inicio: '2026-02-01', prazo: '13 a 24 meses' },
  { metaCPId: 'META031', nome: 'Planejar obras preventivas nas áreas mapeadas', peso: 4, sit: 0.4, status: 'andamento', inicio: '2026-05-01', prazo: '13 a 24 meses' },

  // META032 — Plano de Contingência (atraso)
  { metaCPId: 'META032', nome: 'Contratar consultoria técnica especializada', peso: 2, sit: 0.1, status: 'atraso', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META032', nome: 'Revisar e publicar o novo Plano de Contingência', peso: 4, sit: 0.1, status: 'atraso', inicio: '2025-04-01', prazo: '7 a 12 meses' },

  // META033 — Ampliar linhas de ônibus (concluída)
  { metaCPId: 'META033', nome: 'Diagnosticar bairros sem cobertura de transporte público', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META033', nome: 'Ampliar linhas e frequência de ônibus', peso: 4, sit: 1.0, status: 'concluida', inicio: '2025-05-01', prazo: '7 a 12 meses' },

  // META034 — Reduzir acidentes de trânsito (andamento)
  { metaCPId: 'META034', nome: 'Mapear pontos críticos de acidentes com pedestres e ciclistas', peso: 3, sit: 0.55, status: 'andamento', inicio: '2026-01-01', prazo: '13 a 24 meses' },
  { metaCPId: 'META034', nome: 'Realizar campanhas educativas de trânsito', peso: 3, sit: 0.55, status: 'andamento', inicio: '2026-03-01', prazo: '7 a 12 meses' },

  // META035 — Planejamento das vias do centro (concluída)
  { metaCPId: 'META035', nome: 'Realizar estudo técnico de fluxo de veículos no centro', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META035', nome: 'Implantar plano de uso das vias urbanas centrais', peso: 4, sit: 1.0, status: 'concluida', inicio: '2025-08-01', prazo: '13 a 24 meses' },

  // META036 — Bebedouros públicos (concluída)
  { metaCPId: 'META036', nome: 'Estudar locais adequados para bebedouros públicos', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-04-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META036', nome: 'Instalar os bebedouros nos pontos definidos', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-08-01', prazo: 'Até 6 meses' },

  // META037 — Mobilidade reduzida (andamento)
  { metaCPId: 'META037', nome: 'Mapear barreiras de acessibilidade na estrutura urbana', peso: 3, sit: 0.6, status: 'andamento', inicio: '2026-01-01', prazo: '13 a 24 meses' },
  { metaCPId: 'META037', nome: 'Adequar calçadas e travessias para mobilidade reduzida', peso: 4, sit: 0.6, status: 'andamento', inicio: '2026-03-01', prazo: '13 a 24 meses' },

  // META038 — Gestão de trânsito para veículos pesados (concluída)
  { metaCPId: 'META038', nome: 'Mapear rotas de veículos pesados nas áreas centrais', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META038', nome: 'Implantar mecanismos de gestão de tráfego pesado', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-06-01', prazo: '7 a 12 meses' },

  // META039 — Qualidade do transporte público (andamento)
  { metaCPId: 'META039', nome: 'Diagnosticar a qualidade atual do transporte coletivo', peso: 3, sit: 0.45, status: 'andamento', inicio: '2026-02-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META039', nome: 'Implementar melhorias e incentivos ao uso do transporte público', peso: 4, sit: 0.45, status: 'andamento', inicio: '2026-04-01', prazo: '13 a 24 meses' },

  // META040 — Ciclovias e bicicletas (concluída)
  { metaCPId: 'META040', nome: 'Definir trajeto e projeto das novas ciclovias', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: '7 a 12 meses' },
  { metaCPId: 'META040', nome: 'Construir as ciclovias planejadas', peso: 5, sit: 1.0, status: 'concluida', inicio: '2025-09-01', prazo: '13 a 24 meses' },

  // META041 — Projeto Cidade Educativa (concluída)
  { metaCPId: 'META041', nome: 'Estruturar o conteúdo do Projeto Cidade Educativa', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-03-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META041', nome: 'Levar o Projeto Cidade Educativa às escolas e bairros', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-06-01', prazo: '7 a 12 meses' },

  // META042 — Sinalização das vias (concluída)
  { metaCPId: 'META042', nome: 'Diagnosticar sinalização horizontal e vertical deficiente', peso: 2, sit: 1.0, status: 'concluida', inicio: '2025-02-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META042', nome: 'Executar a manutenção e reposição da sinalização', peso: 3, sit: 1.0, status: 'concluida', inicio: '2025-05-01', prazo: '7 a 12 meses' },

  // META043 — Faixas de pedestres (atraso)
  { metaCPId: 'META043', nome: 'Identificar locais prioritários para novas faixas de pedestre', peso: 2, sit: 0.25, status: 'atraso', inicio: '2025-03-01', prazo: 'Até 6 meses' },
  { metaCPId: 'META043', nome: 'Implantar faixas de pedestres e faixas elevadas', peso: 3, sit: 0.25, status: 'atraso', inicio: '2025-05-01', prazo: '7 a 12 meses' }
];

function senhaAdminDoAmbiente(): string {
  const senha = process.env.SENHA_INICIAL_ADMIN ?? '';
  if (senha.length < 12 || Buffer.byteLength(senha, 'utf8') > SENHA_MAX_BYTES) {
    console.error(
      '[inicializacao] Banco vazio, mas SENHA_INICIAL_ADMIN não está definida ou não tem entre ' +
      '12 e 72 caracteres. Defina-a nas variáveis de ambiente e faça um novo deploy.'
    );
    process.exit(1);
  }
  return senha;
}

async function main() {
  // O seed apaga tudo antes de semear: nunca pode rodar sobre dados reais.
  const existentes = await prisma.usuario.count();
  if (existentes > 0) {
    if (PRODUCAO) {
      console.log('[inicializacao] Banco já inicializado — nada a fazer.');
      return;
    }
    console.error(
      `Abortado: o banco já tem ${existentes} usuário(s) e o seed APAGA todos os dados.\n` +
      'Ele só roda em banco vazio. Para recriar o banco de DESENVOLVIMENTO do zero: npm run db:reset'
    );
    process.exit(1);
  }

  const senhaAdmin = PRODUCAO ? senhaAdminDoAmbiente() : null;
  const usuariosASemear = PRODUCAO ? usuarios.filter(u => u.perfil === 'prefeito') : usuarios;

  // Hash fora da transação, para ela ficar curta.
  const contas: Array<{ u: (typeof usuarios)[number]; senha: string; senhaHash: string }> = [];
  for (const u of usuariosASemear) {
    const senha = senhaAdmin ?? gerarSenhaInicial();
    contas.push({ u, senha, senhaHash: await hashSenha(senha) });
  }

  const hoje = new Date();
  const acoesASemear = PRODUCAO ? [] : acoes;

  // Tudo ou nada: se cair no meio, o próximo start encontra o banco vazio de novo.
  await prisma.$transaction(async db => {
    console.log('Limpando dados anteriores...');
    await db.rateLimit.deleteMany();
    await db.anexo.deleteMany();
    await db.auditoria.deleteMany();
    await db.comentario.deleteMany();
    await db.proposta.deleteMany();
    await db.acao.deleteMany();
    await db.metaCPParticipante.deleteMany();
    await db.metaCP.deleteMany();
    await db.metaLP.deleteMany();
    await db.lotacao.deleteMany();
    await db.usuario.deleteMany();
    await db.divisao.deleteMany();
    await db.secretaria.deleteMany();

    console.log('Semeando secretarias e divisões...');
    for (const s of secretarias) await db.secretaria.create({ data: s });
    for (const d of divisoes) await db.divisao.create({ data: d });

    console.log('Semeando usuários e lotações...');
    for (const { u, senhaHash } of contas) {
      await db.usuario.create({
        data: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, senhaHash }
      });
      for (const [secId, divId] of u.lotacoes) {
        await db.lotacao.create({
          data: { usuarioId: u.id, secretariaId: secId, divisaoId: divId }
        });
      }
    }

    console.log('Semeando metas de longo e curto prazo (Segurança Pública e Mobilidade Urbana)...');
    for (const lp of metasLP) await db.metaLP.create({ data: lp });
    for (const cp of metasCP) {
      const { participantes, ...rest } = cp;
      await db.metaCP.create({ data: rest });
      for (const secId of participantes) {
        await db.metaCPParticipante.create({ data: { metaCPId: cp.id, secretariaId: secId } });
      }
    }

    if (acoesASemear.length) console.log('Semeando ações (progresso SIMULADO, só para demonstração)...');
    const tempoDoLabel: Record<string, { value: string; peso: number }> = {
      'Até 6 meses':       { value: 'ate_6m',    peso: 6  },
      '7 a 12 meses':      { value: '7_12m',     peso: 12 },
      '13 a 24 meses':     { value: '13_24m',    peso: 24 },
      '25 a 36 meses':     { value: '25_36m',    peso: 36 },
      'Acima de 36 meses': { value: 'acima_36m', peso: 48 }
    };
    const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    let i = 1;
    for (const a of acoesASemear) {
      const t = tempoDoLabel[a.prazo] ?? { value: 'ate_6m', peso: 6 };
      const id = `a_${String(i++).padStart(3, '0')}`;
      await db.acao.create({
        data: {
          id,
          metaCPId: a.metaCPId, nome: a.nome,
          peso: t.peso,
          tempoNecessario: t.value,
          alvo: 1.0, unidade: '%',
          situacaoAtual: a.sit, status: a.status,
          inicio: a.inicio, prazo: a.prazo, responsavelId: a.responsavelId
        }
      });
      // Baseline 30d atrás: cerca de 70% do valor atual (simula progresso recente).
      // Isso dá o que comparar no dashboard sem esperar 30 dias reais.
      const situacao30d = Math.max(0, Math.min(1, a.sit * 0.7));
      await db.acaoSnapshot.create({
        data: { acaoId: id, situacaoAtual: situacao30d, peso: t.peso, quando: trintaDiasAtras }
      });
      await db.acaoSnapshot.create({
        data: { acaoId: id, situacaoAtual: a.sit, peso: t.peso, quando: hoje }
      });
    }

    console.log('Semeando trilha de auditoria...');
    await db.auditoria.create({
      data: {
        quando: hoje,
        atorId: 'u_damato', atorNome: 'José Damato Neto', perfil: 'prefeito',
        msg: `inicializou o Plano de Metas — organograma e ${metasCP.length} metas do Plano de Governo importados para a Secretaria de Segurança Pública e Mobilidade Urbana (capítulos 4, 12 e 16)`,
        tag: 'PLANO:PUBLICADO', entidade: 'plano', entidadeId: '2025-2028'
      }
    });
    for (const cp of metasCP) {
      await db.auditoria.create({
        data: {
          quando: hoje,
          atorId: 'u_damato', atorNome: 'José Damato Neto', perfil: 'prefeito',
          msg: `criou meta "${cp.nome}"`,
          tag: 'META:CRIADA', entidade: 'metaCP', entidadeId: cp.id
        }
      });
    }
  }, { timeout: 120_000, maxWait: 10_000 });

  console.log('Seed concluído.');
  console.log(`  - ${secretarias.length} secretarias`);
  console.log(`  - ${divisoes.length} divisões`);
  console.log(`  - ${contas.length} usuário(s)`);
  console.log(`  - ${metasLP.length} metas LP, ${metasCP.length} metas CP`);
  console.log(`  - ${acoesASemear.length} ações`);
  console.log(`  - 0 propostas, ${metasCP.length + 1} eventos de auditoria`);

  if (PRODUCAO) {
    console.log(
      `[inicializacao] Login do administrador: ${contas[0].u.email} — senha = valor de SENHA_INICIAL_ADMIN. ` +
      'Os demais usuários são cadastrados por ele em Usuários → Novo usuário.'
    );
    return;
  }

  console.log('\n=== CREDENCIAIS INICIAIS — exibidas UMA única vez, não ficam gravadas em lugar nenhum ===');
  const larguraEmail = Math.max(...contas.map(c => c.u.email.length));
  for (const { u, senha } of contas) {
    console.log(`  ${u.email.padEnd(larguraEmail)}  ${u.perfil.padEnd(10)}  ${senha}`);
  }
  console.log('Para redefinir a senha de alguém depois: npm run usuario:senha -- <email>\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
