-- AlterTable
ALTER TABLE `Form` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Form_deletedAt_idx` ON `Form`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Form` ADD CONSTRAINT `Form_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

