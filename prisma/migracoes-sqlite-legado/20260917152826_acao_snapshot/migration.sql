-- CreateTable
CREATE TABLE "AcaoSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "acaoId" TEXT NOT NULL,
    "situacaoAtual" REAL NOT NULL,
    "peso" INTEGER NOT NULL,
    "quando" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcaoSnapshot_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AcaoSnapshot_acaoId_quando_idx" ON "AcaoSnapshot"("acaoId", "quando");

-- CreateIndex
CREATE INDEX "AcaoSnapshot_quando_idx" ON "AcaoSnapshot"("quando");
