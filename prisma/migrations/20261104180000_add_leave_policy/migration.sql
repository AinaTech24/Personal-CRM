-- CreateTable
CREATE TABLE `LeavePolicy` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `paidYearlyAllowance` INTEGER NOT NULL DEFAULT 12,
    `paidMonthlyAllowance` INTEGER NULL,
    `unpaidYearlyAllowance` INTEGER NULL,
    `unpaidMonthlyAllowance` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
