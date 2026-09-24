/*
  Warnings:

  - You are about to drop the column `duplaLotacao` on the `Divisao` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Divisao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "chefeId" TEXT,
    CONSTRAINT "Divisao_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Divisao" ("chefeId", "id", "nome", "secretariaId") SELECT "chefeId", "id", "nome", "secretariaId" FROM "Divisao";
DROP TABLE "Divisao";
ALTER TABLE "new_Divisao" RENAME TO "Divisao";
CREATE INDEX "Divisao_secretariaId_idx" ON "Divisao"("secretariaId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
