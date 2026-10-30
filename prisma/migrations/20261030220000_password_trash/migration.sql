-- AlterTable
ALTER TABLE `PasswordEntry` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `PasswordEntry_deletedAt_idx` ON `PasswordEntry`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `PasswordEntry` ADD CONSTRAINT `PasswordEntry_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

