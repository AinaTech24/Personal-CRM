-- AlterTable
ALTER TABLE `Meeting` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Meeting_deletedAt_idx` ON `Meeting`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
