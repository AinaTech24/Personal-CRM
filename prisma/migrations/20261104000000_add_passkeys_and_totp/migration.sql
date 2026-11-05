-- AlterTable
ALTER TABLE `User` ADD COLUMN `totpSecret` TEXT NULL,
    ADD COLUMN `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `totpBackupCodesHash` TEXT NULL;

-- CreateTable
CREATE TABLE `Passkey` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(255) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `counter` BIGINT NOT NULL DEFAULT 0,
    `deviceType` VARCHAR(191) NOT NULL,
    `backedUp` BOOLEAN NOT NULL DEFAULT false,
    `transports` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Passkey_credentialId_key`(`credentialId`),
    INDEX `Passkey_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Passkey` ADD CONSTRAINT `Passkey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
