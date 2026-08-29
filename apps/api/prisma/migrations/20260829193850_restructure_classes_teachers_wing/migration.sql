/*
  Warnings:

  - You are about to drop the column `name` on the `Class` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[schoolId,number,section]` on the table `Class` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `number` to the `Class` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wing` to the `Class` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Wing" AS ENUM ('junior', 'senior', 'both');

-- AlterTable
ALTER TABLE "Class" DROP COLUMN "name",
ADD COLUMN     "classTeacherId" TEXT,
ADD COLUMN     "number" INTEGER NOT NULL,
ADD COLUMN     "wing" "Wing" NOT NULL;

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wing" "Wing" NOT NULL,
    "isClassTeacher" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE INDEX "Class_wing_idx" ON "Class"("wing");

-- CreateIndex
CREATE UNIQUE INDEX "Class_schoolId_number_section_key" ON "Class"("schoolId", "number", "section");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
