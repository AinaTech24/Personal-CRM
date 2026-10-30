-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Expense_deletedAt_idx` ON `Expense`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

