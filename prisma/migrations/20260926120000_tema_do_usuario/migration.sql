-- Só acrescenta uma coluna opcional: não altera nem apaga nenhum dado.
-- Guarda o tema de cores escolhido por cada usuário (vazio = padrão Azul Cubic).

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "tema" TEXT;
