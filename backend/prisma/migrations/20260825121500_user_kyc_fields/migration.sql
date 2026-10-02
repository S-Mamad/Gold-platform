-- AlterTable
ALTER TABLE "User" ADD COLUMN "nationalCode" TEXT;
ALTER TABLE "User" ADD COLUMN "birthDate" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_nationalCode_key" ON "User"("nationalCode");
