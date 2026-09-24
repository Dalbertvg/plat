-- CreateTable
CREATE TABLE "Secretaria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "titular" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'secretaria'
);

-- CreateTable
CREATE TABLE "Divisao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "duplaLotacao" TEXT,
    "chefeId" TEXT,
    CONSTRAINT "Divisao_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" DATETIME
);

-- CreateTable
CREATE TABLE "Lotacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "divisaoId" TEXT,
    CONSTRAINT "Lotacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lotacao_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lotacao_divisaoId_fkey" FOREIGN KEY ("divisaoId") REFERENCES "Divisao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetaLP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capitulo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,
    CONSTRAINT "MetaLP_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetaCP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "metaLPId" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,
    "divisaoExecutoraId" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaCP_metaLPId_fkey" FOREIGN KEY ("metaLPId") REFERENCES "MetaLP" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MetaCP_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MetaCP_divisaoExecutoraId_fkey" FOREIGN KEY ("divisaoExecutoraId") REFERENCES "Divisao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetaCPParticipante" (
    "metaCPId" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,

    PRIMARY KEY ("metaCPId", "secretariaId"),
    CONSTRAINT "MetaCPParticipante_metaCPId_fkey" FOREIGN KEY ("metaCPId") REFERENCES "MetaCP" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MetaCPParticipante_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Acao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metaCPId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "alvo" REAL NOT NULL,
    "situacaoAtual" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "inicio" TEXT,
    "prazo" TEXT,
    "responsavelId" TEXT,
    "ultJustificativa" TEXT,
    "ultJustQuando" DATETIME,
    CONSTRAINT "Acao_metaCPId_fkey" FOREIGN KEY ("metaCPId") REFERENCES "MetaCP" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Acao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proposta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,
    "divisaoOrigemId" TEXT,
    "proximoRevisor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprovadaEm" DATETIME,
    "aprovadaPor" TEXT,
    "rejeitadaEm" DATETIME,
    "rejeitadaPor" TEXT,
    CONSTRAINT "Proposta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Proposta_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Proposta_divisaoOrigemId_fkey" FOREIGN KEY ("divisaoOrigemId") REFERENCES "Divisao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propostaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "quando" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comentario_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quando" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atorId" TEXT NOT NULL,
    "atorNome" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "lotacaoUsada" TEXT,
    CONSTRAINT "Auditoria_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE INDEX "Acao_metaCPId_idx" ON "Acao"("metaCPId");

-- CreateIndex
CREATE INDEX "Acao_responsavelId_idx" ON "Acao"("responsavelId");

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
