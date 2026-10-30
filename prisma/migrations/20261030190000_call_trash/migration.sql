-- AlterTable
ALTER TABLE `Call` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Call_deletedAt_idx` ON `Call`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Call` ADD CONSTRAINT `Call_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

