-- CreateTable
CREATE TABLE "Secretaria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titular" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'secretaria',

    CONSTRAINT "Secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Divisao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "chefeId" TEXT,

    CONSTRAINT "Divisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "senhaHash" TEXT NOT NULL,
    "sessaoVersao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lotacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "divisaoId" TEXT,

    CONSTRAINT "Lotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaLP" (
    "id" TEXT NOT NULL,
    "capitulo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,

    CONSTRAINT "MetaLP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCP" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'secundaria',
    "metaLPId" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,
    "divisaoExecutoraId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "arquivadaEm" TIMESTAMP(3),
    "arquivadaPor" TEXT,
    "arquivadaJustificativa" TEXT,

    CONSTRAINT "MetaCP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCPParticipante" (
    "metaCPId" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,

    CONSTRAINT "MetaCPParticipante_pkey" PRIMARY KEY ("metaCPId","secretariaId")
);

-- CreateTable
CREATE TABLE "Acao" (
    "id" TEXT NOT NULL,
    "metaCPId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "tempoNecessario" TEXT,
    "alvo" DOUBLE PRECISION NOT NULL,
    "unidade" TEXT,
    "situacaoAtual" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "inicio" TEXT,
    "prazo" TEXT,
    "responsavelId" TEXT,
    "ultJustificativa" TEXT,
    "ultJustQuando" TIMESTAMP(3),

    CONSTRAINT "Acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageDriver" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcaoSnapshot" (
    "id" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "situacaoAtual" DOUBLE PRECISION NOT NULL,
    "peso" INTEGER NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcaoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposta" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,
    "divisaoOrigemId" TEXT,
    "metaCPRefId" TEXT,
    "proximoRevisor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprovadaEm" TIMESTAMP(3),
    "aprovadaPor" TEXT,
    "rejeitadaEm" TIMESTAMP(3),
    "rejeitadaPor" TEXT,
    "payloadJson" TEXT,
    "aplicadaEm" TIMESTAMP(3),
    "aplicacaoErro" TEXT,

    CONSTRAINT "Proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atorId" TEXT NOT NULL,
    "atorNome" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "lotacaoUsada" TEXT,
    "parentId" TEXT,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "chave" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL DEFAULT 0,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "Divisao_secretariaId_idx" ON "Divisao"("secretariaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Lotacao_usuarioId_idx" ON "Lotacao"("usuarioId");

-- CreateIndex
CREATE INDEX "Lotacao_secretariaId_idx" ON "Lotacao"("secretariaId");

-- CreateIndex
CREATE INDEX "Lotacao_divisaoId_idx" ON "Lotacao"("divisaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Lotacao_usuarioId_secretariaId_divisaoId_key" ON "Lotacao"("usuarioId", "secretariaId", "divisaoId");

-- CreateIndex
CREATE INDEX "MetaLP_secretariaDonaId_idx" ON "MetaLP"("secretariaDonaId");

-- CreateIndex
CREATE INDEX "MetaCP_secretariaDonaId_idx" ON "MetaCP"("secretariaDonaId");

-- CreateIndex
CREATE INDEX "MetaCP_divisaoExecutoraId_idx" ON "MetaCP"("divisaoExecutoraId");

-- CreateIndex
CREATE INDEX "MetaCP_arquivada_idx" ON "MetaCP"("arquivada");

-- CreateIndex
CREATE INDEX "Acao_metaCPId_idx" ON "Acao"("metaCPId");

-- CreateIndex
CREATE INDEX "Acao_responsavelId_idx" ON "Acao"("responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "Anexo_storageKey_key" ON "Anexo"("storageKey");

-- CreateIndex
CREATE INDEX "Anexo_acaoId_idx" ON "Anexo"("acaoId");

-- CreateIndex
CREATE INDEX "AcaoSnapshot_acaoId_quando_idx" ON "AcaoSnapshot"("acaoId", "quando");

-- CreateIndex
CREATE INDEX "AcaoSnapshot_quando_idx" ON "AcaoSnapshot"("quando");

-- CreateIndex
CREATE INDEX "Proposta_status_idx" ON "Proposta"("status");

-- CreateIndex
CREATE INDEX "Proposta_proximoRevisor_idx" ON "Proposta"("proximoRevisor");

-- CreateIndex
CREATE INDEX "Comentario_propostaId_idx" ON "Comentario"("propostaId");

-- CreateIndex
CREATE INDEX "Auditoria_quando_idx" ON "Auditoria"("quando");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "Auditoria_parentId_idx" ON "Auditoria"("parentId");

-- CreateIndex
CREATE INDEX "RateLimit_expiraEm_idx" ON "RateLimit"("expiraEm");

-- AddForeignKey
ALTER TABLE "Divisao" ADD CONSTRAINT "Divisao_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lotacao" ADD CONSTRAINT "Lotacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lotacao" ADD CONSTRAINT "Lotacao_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lotacao" ADD CONSTRAINT "Lotacao_divisaoId_fkey" FOREIGN KEY ("divisaoId") REFERENCES "Divisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLP" ADD CONSTRAINT "MetaLP_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCP" ADD CONSTRAINT "MetaCP_metaLPId_fkey" FOREIGN KEY ("metaLPId") REFERENCES "MetaLP"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCP" ADD CONSTRAINT "MetaCP_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCP" ADD CONSTRAINT "MetaCP_divisaoExecutoraId_fkey" FOREIGN KEY ("divisaoExecutoraId") REFERENCES "Divisao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCPParticipante" ADD CONSTRAINT "MetaCPParticipante_metaCPId_fkey" FOREIGN KEY ("metaCPId") REFERENCES "MetaCP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCPParticipante" ADD CONSTRAINT "MetaCPParticipante_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_metaCPId_fkey" FOREIGN KEY ("metaCPId") REFERENCES "MetaCP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoSnapshot" ADD CONSTRAINT "AcaoSnapshot_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_divisaoOrigemId_fkey" FOREIGN KEY ("divisaoOrigemId") REFERENCES "Divisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Auditoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
