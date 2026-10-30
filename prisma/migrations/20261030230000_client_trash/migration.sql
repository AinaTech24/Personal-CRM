-- AlterTable
ALTER TABLE `Client` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Client_deletedAt_idx` ON `Client`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

