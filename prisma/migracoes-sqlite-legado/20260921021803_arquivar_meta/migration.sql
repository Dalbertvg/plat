-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MetaCP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'secundaria',
    "metaLPId" TEXT NOT NULL,
    "secretariaDonaId" TEXT NOT NULL,
    "divisaoExecutoraId" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "arquivadaEm" DATETIME,
    "arquivadaPor" TEXT,
    "arquivadaJustificativa" TEXT,
    CONSTRAINT "MetaCP_metaLPId_fkey" FOREIGN KEY ("metaLPId") REFERENCES "MetaLP" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MetaCP_secretariaDonaId_fkey" FOREIGN KEY ("secretariaDonaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MetaCP_divisaoExecutoraId_fkey" FOREIGN KEY ("divisaoExecutoraId") REFERENCES "Divisao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MetaCP" ("criadoEm", "divisaoExecutoraId", "id", "metaLPId", "nome", "secretariaDonaId", "tipo") SELECT "criadoEm", "divisaoExecutoraId", "id", "metaLPId", "nome", "secretariaDonaId", "tipo" FROM "MetaCP";
DROP TABLE "MetaCP";
ALTER TABLE "new_MetaCP" RENAME TO "MetaCP";
CREATE INDEX "MetaCP_secretariaDonaId_idx" ON "MetaCP"("secretariaDonaId");
CREATE INDEX "MetaCP_divisaoExecutoraId_idx" ON "MetaCP"("divisaoExecutoraId");
CREATE INDEX "MetaCP_arquivada_idx" ON "MetaCP"("arquivada");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
