-- AlterTable
ALTER TABLE `Note` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Note_deletedAt_idx` ON `Note`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
