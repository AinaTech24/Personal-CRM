-- AlterTable
ALTER TABLE `Project` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Project_deletedAt_idx` ON `Project`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
