-- AlterTable
ALTER TABLE `SocialClient` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SocialContentItem` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SocialAdCampaign` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SocialMonthlyReport` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `SocialClient_deletedAt_idx` ON `SocialClient`(`deletedAt`);

-- CreateIndex
CREATE INDEX `SocialContentItem_deletedAt_idx` ON `SocialContentItem`(`deletedAt`);

-- CreateIndex
CREATE INDEX `SocialAdCampaign_deletedAt_idx` ON `SocialAdCampaign`(`deletedAt`);

-- CreateIndex
CREATE INDEX `SocialMonthlyReport_deletedAt_idx` ON `SocialMonthlyReport`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `SocialClient` ADD CONSTRAINT `SocialClient_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentItem` ADD CONSTRAINT `SocialContentItem_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAdCampaign` ADD CONSTRAINT `SocialAdCampaign_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialMonthlyReport` ADD CONSTRAINT `SocialMonthlyReport_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

