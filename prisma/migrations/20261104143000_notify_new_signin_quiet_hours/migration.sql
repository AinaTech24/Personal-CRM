-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `notifyOnNewSignIn` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `quietHoursStart` VARCHAR(191) NULL,
    ADD COLUMN `quietHoursEnd` VARCHAR(191) NULL;
