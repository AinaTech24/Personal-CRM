-- AlterTable
ALTER TABLE `Quotation` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Quotation_deletedAt_idx` ON `Quotation`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
