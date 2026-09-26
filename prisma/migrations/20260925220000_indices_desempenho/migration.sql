-- Só cria índices: não altera nem apaga nenhum dado.
-- Acelera os filtros de Auditoria (ator / tipo) e as listas de Propostas
-- por autor, secretaria e divisão, e a visibilidade de metas conjuntas.

-- CreateIndex
CREATE INDEX "Auditoria_atorId_quando_idx" ON "Auditoria"("atorId", "quando");

-- CreateIndex
CREATE INDEX "Auditoria_tag_quando_idx" ON "Auditoria"("tag", "quando");

-- CreateIndex
CREATE INDEX "MetaCPParticipante_secretariaId_idx" ON "MetaCPParticipante"("secretariaId");

-- CreateIndex
CREATE INDEX "Proposta_autorId_idx" ON "Proposta"("autorId");

-- CreateIndex
CREATE INDEX "Proposta_secretariaDonaId_idx" ON "Proposta"("secretariaDonaId");

-- CreateIndex
CREATE INDEX "Proposta_divisaoOrigemId_idx" ON "Proposta"("divisaoOrigemId");
