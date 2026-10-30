-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Invoice_deletedAt_idx` ON `Invoice`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
