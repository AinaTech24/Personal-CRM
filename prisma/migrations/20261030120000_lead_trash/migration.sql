-- AlterTable
ALTER TABLE `Lead` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Lead_deletedAt_idx` ON `Lead`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
