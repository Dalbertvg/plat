-- AlterTable
ALTER TABLE "Proposta" ADD COLUMN "aplicacaoErro" TEXT;
ALTER TABLE "Proposta" ADD COLUMN "aplicadaEm" DATETIME;
ALTER TABLE "Proposta" ADD COLUMN "payloadJson" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Auditoria" (
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
    "parentId" TEXT,
    CONSTRAINT "Auditoria_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auditoria_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Auditoria" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Auditoria" ("atorId", "atorNome", "entidade", "entidadeId", "id", "lotacaoUsada", "msg", "perfil", "quando", "tag") SELECT "atorId", "atorNome", "entidade", "entidadeId", "id", "lotacaoUsada", "msg", "perfil", "quando", "tag" FROM "Auditoria";
DROP TABLE "Auditoria";
ALTER TABLE "new_Auditoria" RENAME TO "Auditoria";
CREATE INDEX "Auditoria_quando_idx" ON "Auditoria"("quando");
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");
CREATE INDEX "Auditoria_parentId_idx" ON "Auditoria"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
