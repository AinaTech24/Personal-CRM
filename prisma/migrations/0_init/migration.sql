-- CreateTable
CREATE TABLE `Department` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Department_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserModulePermission` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `module` ENUM('LEAVE', 'ATTENDANCE', 'TASKS', 'MEETINGS', 'LEADS', 'CLIENTS', 'BIRTHDAYS', 'MESSAGES', 'PROJECTS', 'EXPENSES') NOT NULL,
    `canCreate` BOOLEAN NOT NULL DEFAULT false,
    `canRead` BOOLEAN NOT NULL DEFAULT false,
    `canUpdate` BOOLEAN NOT NULL DEFAULT false,
    `canDelete` BOOLEAN NOT NULL DEFAULT false,
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserModulePermission_userId_idx`(`userId`),
    UNIQUE INDEX `UserModulePermission_userId_module_key`(`userId`, `module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `surname` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `birthday` DATE NULL,
    `designation` VARCHAR(191) NULL,
    `dateOfJoining` DATE NULL,
    `avatarDataUrl` LONGTEXT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_USER') NOT NULL DEFAULT 'DEPARTMENT_USER',
    `departmentId` VARCHAR(191) NULL,
    `isDepartmentAdmin` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `resetCode` VARCHAR(191) NULL,
    `resetCodeExpiresAt` DATETIME(3) NULL,
    `pinHash` VARCHAR(191) NULL,
    `pinResetCode` VARCHAR(191) NULL,
    `pinResetCodeExpiresAt` DATETIME(3) NULL,
    `timezone` VARCHAR(191) NULL DEFAULT 'Asia/Kolkata',
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `defaultLandingPage` VARCHAR(191) NULL,
    `density` VARCHAR(191) NOT NULL DEFAULT 'comfortable',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_mobile_key`(`mobile`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    INDEX `PushSubscription_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invite` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_USER') NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `socialMediaAdmin` BOOLEAN NOT NULL DEFAULT false,
    `socialMediaMember` BOOLEAN NOT NULL DEFAULT false,
    `crmAdmin` BOOLEAN NOT NULL DEFAULT false,
    `crmMember` BOOLEAN NOT NULL DEFAULT false,
    `teamId` VARCHAR(191) NULL,
    `teamIsLead` BOOLEAN NOT NULL DEFAULT false,
    `inviteeIsDepartmentAdmin` BOOLEAN NOT NULL DEFAULT false,
    `token` VARCHAR(191) NOT NULL,
    `invitedById` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Invite_token_key`(`token`),
    INDEX `Invite_email_idx`(`email`),
    INDEX `Invite_teamId_idx`(`teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `inApp` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `NotificationPreference_userId_category_key`(`userId`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `product` VARCHAR(191) NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('NEW', 'CONTACTED', 'MEETING', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST') NOT NULL DEFAULT 'NEW',
    `leadArriveDate` DATETIME(3) NULL,
    `meetingDate` DATETIME(3) NULL,
    `meetingStatus` ENUM('SCHEDULED', 'DUE', 'COMPLETED') NULL,
    `assignedToId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `convertedToClientId` VARCHAR(191) NULL,

    INDEX `Lead_status_idx`(`status`),
    INDEX `Lead_departmentId_idx`(`departmentId`),
    INDEX `Lead_assignedToId_idx`(`assignedToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadNote` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadActivity` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadReminder` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'TODO',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `dueDate` DATETIME(3) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `projectTaskParentId` VARCHAR(191) NULL,
    `remindAt` DATETIME(3) NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Task_projectTaskParentId_key`(`projectTaskParentId`),
    INDEX `Task_status_idx`(`status`),
    INDEX `Task_assignedToId_idx`(`assignedToId`),
    INDEX `Task_remindAt_idx`(`remindAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskComment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NULL,
    `url` TEXT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `assignedToId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `estimatedHours` INTEGER NULL,

    INDEX `Project_departmentId_idx`(`departmentId`),
    INDEX `Project_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSupporter` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectSupporter_projectId_idx`(`projectId`),
    UNIQUE INDEX `ProjectSupporter_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectTimeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workDate` DATE NOT NULL,
    `minutes` INTEGER NOT NULL,
    `description` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectTimeEntry_projectId_workDate_idx`(`projectId`, `workDate`),
    INDEX `ProjectTimeEntry_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectMember` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'member',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProjectMember_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Milestone` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'WORKING', 'DONE') NOT NULL DEFAULT 'PENDING',
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectTask` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `milestoneId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'TODO',
    `dueDate` DATETIME(3) NULL,
    `progressPct` INTEGER NOT NULL DEFAULT 0,
    `assignedToId` VARCHAR(191) NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `parentTaskId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectTask_projectId_idx`(`projectId`),
    INDEX `ProjectTask_status_idx`(`status`),
    INDEX `ProjectTask_assignedToId_idx`(`assignedToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectTaskDependency` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `dependsOnId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ProjectTaskDependency_taskId_dependsOnId_key`(`taskId`, `dependsOnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectDocument` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectActivity` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quotation` (
    `id` VARCHAR(191) NOT NULL,
    `quotationNumber` VARCHAR(191) NOT NULL,
    `clientName` VARCHAR(191) NOT NULL,
    `clientEmail` VARCHAR(191) NULL,
    `leadId` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `gstAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `validUntil` DATETIME(3) NULL,
    `clientAddress` TEXT NULL,
    `clientGstin` VARCHAR(191) NULL,
    `shipToAddress` TEXT NULL,
    `shipToGstin` VARCHAR(191) NULL,
    `placeOfSupply` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `sellerName` VARCHAR(191) NULL,
    `sellerAddress` TEXT NULL,
    `sellerGstin` VARCHAR(191) NULL,
    `sellerPhone` VARCHAR(191) NULL,
    `sellerEmail` VARCHAR(191) NULL,
    `sellerWebsite` VARCHAR(191) NULL,
    `sellerSignatory` VARCHAR(191) NULL,
    `sellerLogoDataUrl` LONGTEXT NULL,
    `sellerSignatureDataUrl` LONGTEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `currentVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quotation_quotationNumber_key`(`quotationNumber`),
    INDEX `Quotation_status_idx`(`status`),
    INDEX `Quotation_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationItem` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `hsnSac` VARCHAR(191) NULL,
    `qty` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `gstRate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `lineTotal` DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationVersion` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `QuotationVersion_quotationId_versionNumber_key`(`quotationId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationApproval` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `approverId` VARCHAR(191) NOT NULL,
    `decision` VARCHAR(191) NOT NULL,
    `comment` TEXT NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NULL,
    `clientName` VARCHAR(191) NOT NULL,
    `clientEmail` VARCHAR(191) NULL,
    `clientAddress` TEXT NULL,
    `clientGstin` VARCHAR(191) NULL,
    `shipToAddress` TEXT NULL,
    `shipToGstin` VARCHAR(191) NULL,
    `invoiceDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `terms` VARCHAR(191) NULL,
    `poNumber` VARCHAR(191) NULL,
    `placeOfSupply` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `sellerName` VARCHAR(191) NULL,
    `sellerAddress` TEXT NULL,
    `sellerGstin` VARCHAR(191) NULL,
    `sellerPhone` VARCHAR(191) NULL,
    `sellerEmail` VARCHAR(191) NULL,
    `sellerWebsite` VARCHAR(191) NULL,
    `sellerSignatory` VARCHAR(191) NULL,
    `sellerLogoDataUrl` LONGTEXT NULL,
    `sellerSignatureDataUrl` LONGTEXT NULL,
    `status` ENUM('DRAFT', 'SENT', 'PAID', 'PARTIAL_PAYMENT', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `gstAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `dueDate` DATETIME(3) NULL,
    `overdueReminderSentAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    INDEX `Invoice_status_idx`(`status`),
    INDEX `Invoice_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `hsnSac` VARCHAR(191) NULL,
    `qty` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `gstRate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `lineTotal` DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyProfile` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `addressLines` TEXT NULL,
    `gstin` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `signatoryName` VARCHAR(191) NULL,
    `logoDataUrl` LONGTEXT NULL,
    `signatureDataUrl` LONGTEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `appUrl` VARCHAR(191) NULL,
    `hiddenModules` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmtpSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `host` VARCHAR(191) NULL,
    `port` INTEGER NOT NULL DEFAULT 587,
    `secure` BOOLEAN NOT NULL DEFAULT false,
    `username` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `fromEmail` VARCHAR(191) NULL,
    `fromName` VARCHAR(191) NULL DEFAULT 'Aina CRM',
    `allowExternalInvites` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recordedById` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `checkIn` DATETIME(3) NULL,
    `checkOut` DATETIME(3) NULL,
    `breakIn` DATETIME(3) NULL,
    `breakMinutes` INTEGER NOT NULL DEFAULT 0,
    `workedMinutes` INTEGER NULL,
    `calculatedStatus` ENUM('PRESENT', 'HALF_DAY', 'ABSENT') NULL,
    `status` ENUM('PRESENT', 'HALF_DAY', 'ABSENT') NULL,
    `statusOverride` BOOLEAN NOT NULL DEFAULT false,
    `overrideReason` VARCHAR(191) NULL,
    `halfDayReason` ENUM('LATE_ARRIVAL', 'EARLY_DEPARTURE', 'INSUFFICIENT_HOURS', 'APPROVED_HALF_DAY', 'MANUAL_ADJUSTMENT', 'OTHER') NULL,
    `adminNote` VARCHAR(191) NULL,
    `approvalStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Attendance_date_idx`(`date`),
    INDEX `Attendance_userId_date_idx`(`userId`, `date`),
    INDEX `Attendance_approvalStatus_idx`(`approvalStatus`),
    UNIQUE INDEX `Attendance_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceAudit` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('PRESENT', 'HALF_DAY', 'ABSENT') NULL,
    `toStatus` ENUM('PRESENT', 'HALF_DAY', 'ABSENT') NULL,
    `note` TEXT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AttendanceAudit_attendanceId_idx`(`attendanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserLeave` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `type` ENUM('FULL_DAY', 'HALF_DAY') NOT NULL DEFAULT 'FULL_DAY',
    `reason` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserLeave_date_idx`(`date`),
    UNIQUE INDEX `UserLeave_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `shifts` JSON NULL,
    `fullDayMinutes` INTEGER NOT NULL DEFAULT 480,
    `halfDayMinutes` INTEGER NOT NULL DEFAULT 240,
    `requireApproval` BOOLEAN NOT NULL DEFAULT true,
    `requireHalfDayReason` BOOLEAN NOT NULL DEFAULT false,
    `workingWeekdays` VARCHAR(191) NOT NULL DEFAULT '1,2,3,4,5,6',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Holiday_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Meeting` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `status` ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `organizerId` VARCHAR(191) NOT NULL,
    `remindAt` DATETIME(3) NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Meeting_startsAt_idx`(`startsAt`),
    INDEX `Meeting_organizerId_idx`(`organizerId`),
    INDEX `Meeting_remindAt_idx`(`remindAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('DIRECT', 'GROUP') NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `imageDataUrl` LONGTEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Conversation_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationMember` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastReadAt` DATETIME(3) NULL,
    `isGroupAdmin` BOOLEAN NOT NULL DEFAULT false,
    `adminUntil` DATETIME(3) NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConversationMember_userId_idx`(`userId`),
    UNIQUE INDEX `ConversationMember_conversationId_userId_key`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `replyToId` VARCHAR(191) NULL,
    `forwardedFromName` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `deletedForEveryone` BOOLEAN NOT NULL DEFAULT false,
    `pinnedAt` DATETIME(3) NULL,
    `pinnedById` VARCHAR(191) NULL,

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `Message_replyToId_idx`(`replyToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageReaction` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MessageReaction_messageId_idx`(`messageId`),
    UNIQUE INDEX `MessageReaction_messageId_userId_emoji_key`(`messageId`, `userId`, `emoji`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageHidden` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MessageHidden_userId_idx`(`userId`),
    UNIQUE INDEX `MessageHidden_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `data` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MessageAttachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NULL,
    `summary` TEXT NOT NULL,
    `changes` JSON NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_model_recordId_idx`(`model`, `recordId`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditLog_model_createdAt_idx`(`model`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CrmMember` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CrmMember_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `disabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Team_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamMember` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TeamMember_userId_idx`(`userId`),
    UNIQUE INDEX `TeamMember_teamId_userId_key`(`teamId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Call` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `clientName` VARCHAR(191) NULL,
    `callType` ENUM('INCOMING', 'OUTGOING', 'MISSED') NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `nextAction` TEXT NULL,
    `subject` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Call_leadId_idx`(`leadId`),
    INDEX `Call_ownerId_idx`(`ownerId`),
    INDEX `Call_startTime_idx`(`startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialClient` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NULL,
    `contactPerson` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `stage` ENUM('ENQUIRY', 'CALLING', 'MEETING', 'PLAN_DISCUSSION', 'APPROVAL', 'ONBOARDED') NOT NULL DEFAULT 'ENQUIRY',
    `planNotes` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `onboardedAt` DATETIME(3) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `folderOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `SocialClient_stage_idx`(`stage`),
    INDEX `SocialClient_assignedToId_idx`(`assignedToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialClientFolder` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialClientFolder_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialClientImage` (
    `id` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialClientImage_folderId_idx`(`folderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialPlatformAccount` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER', 'YOUTUBE') NOT NULL,
    `handle` VARCHAR(191) NULL,
    `credentialsReceived` BOOLEAN NOT NULL DEFAULT false,
    `password` TEXT NULL,
    `credentialsUpdatedAt` DATETIME(3) NULL,
    `credentialsUpdatedById` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SocialPlatformAccount_clientId_platform_key`(`clientId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialContentCalendarSlot` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `week` INTEGER NOT NULL,
    `weekday` ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL,
    `contentType` ENUM('STATIC_POST', 'CAROUSEL', 'AI_REEL', 'REAL_PERSON_REEL') NULL,
    `note` VARCHAR(191) NULL,
    `manualNumber` INTEGER NULL,
    `status` ENUM('NOT_UPLOADED', 'PENDING', 'DONE') NOT NULL DEFAULT 'NOT_UPLOADED',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialContentCalendarSlot_clientId_year_month_idx`(`clientId`, `year`, `month`),
    UNIQUE INDEX `SocialContentCalendarSlot_clientId_year_month_week_weekday_key`(`clientId`, `year`, `month`, `week`, `weekday`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialContentItem` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `type` ENUM('STATIC_POST', 'CAROUSEL', 'AI_REEL', 'REAL_PERSON_REEL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `caption` TEXT NULL,
    `hashtags` VARCHAR(191) NULL,
    `stage` ENUM('DRAFT', 'SCRIPT', 'SCRIPT_APPROVED', 'SHARED_IN_GROUP', 'APPROVED_TO_PROCEED', 'CLIENT_CLIPS_RECEIVED', 'EDITING', 'IN_PRODUCTION', 'SHARED_FOR_REVIEW', 'APPROVED_FINAL', 'PUBLISHED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `platforms` VARCHAR(191) NOT NULL,
    `scheduledFor` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialContentItem_clientId_idx`(`clientId`),
    INDEX `SocialContentItem_stage_idx`(`stage`),
    INDEX `SocialContentItem_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialContentApproval` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `fromStage` ENUM('DRAFT', 'SCRIPT', 'SCRIPT_APPROVED', 'SHARED_IN_GROUP', 'APPROVED_TO_PROCEED', 'CLIENT_CLIPS_RECEIVED', 'EDITING', 'IN_PRODUCTION', 'SHARED_FOR_REVIEW', 'APPROVED_FINAL', 'PUBLISHED', 'CANCELLED') NOT NULL,
    `toStage` ENUM('DRAFT', 'SCRIPT', 'SCRIPT_APPROVED', 'SHARED_IN_GROUP', 'APPROVED_TO_PROCEED', 'CLIENT_CLIPS_RECEIVED', 'EDITING', 'IN_PRODUCTION', 'SHARED_FOR_REVIEW', 'APPROVED_FINAL', 'PUBLISHED', 'CANCELLED') NOT NULL,
    `comment` TEXT NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialAdCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `objective` ENUM('LEADS', 'REACH', 'FOLLOWERS') NOT NULL,
    `platforms` VARCHAR(191) NULL,
    `budget` DECIMAL(12, 2) NULL,
    `durationDays` INTEGER NULL,
    `targetAudience` TEXT NULL,
    `location` VARCHAR(191) NULL,
    `stage` ENUM('DISCUSSION', 'BUDGET_DURATION', 'TARGETING', 'CONTENT_APPROVAL', 'AD_CREATION', 'GROUP_APPROVAL', 'CAMPAIGN_SETUP', 'RUNNING', 'REPORTING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DISCUSSION',
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `leadsGenerated` INTEGER NULL,
    `reach` INTEGER NULL,
    `cost` DECIMAL(12, 2) NULL,
    `ctr` DECIMAL(5, 2) NULL,
    `conversions` INTEGER NULL,
    `retargetingNotes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialAdCampaign_clientId_idx`(`clientId`),
    INDEX `SocialAdCampaign_stage_idx`(`stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialMonthlyReport` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `reach` INTEGER NULL,
    `engagement` INTEGER NULL,
    `followersGained` INTEGER NULL,
    `bestPosts` TEXT NULL,
    `adSpend` DECIMAL(12, 2) NULL,
    `adLeads` INTEGER NULL,
    `adCost` DECIMAL(12, 2) NULL,
    `adCtr` DECIMAL(5, 2) NULL,
    `adConversions` INTEGER NULL,
    `insights` TEXT NULL,
    `retargetingSuggestions` TEXT NULL,
    `nextMonthPlan` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SocialMonthlyReport_clientId_year_month_key`(`clientId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialReportFile` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialReportFile_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialClientActivity` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialClientActivity_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordEntry` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `link` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `password` TEXT NOT NULL,
    `faviconDataUrl` LONGTEXT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `rotationReminderSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PasswordEntry_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordEntryShare` (
    `id` VARCHAR(191) NOT NULL,
    `passwordEntryId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sharedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordEntryShare_userId_idx`(`userId`),
    UNIQUE INDEX `PasswordEntryShare_passwordEntryId_userId_key`(`passwordEntryId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordEntryActivity` (
    `id` VARCHAR(191) NOT NULL,
    `passwordEntryId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordEntryActivity_passwordEntryId_idx`(`passwordEntryId`),
    INDEX `PasswordEntryActivity_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `category` ENUM('CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER') NOT NULL DEFAULT 'CASUAL',
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `isHalfDay` BOOLEAN NOT NULL DEFAULT false,
    `days` DOUBLE NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `adminNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveRequest_userId_startDate_idx`(`userId`, `startDate`),
    INDEX `LeaveRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `category` ENUM('TRAVEL', 'FOOD', 'ACCOMMODATION', 'OFFICE_SUPPLIES', 'SOFTWARE', 'CLIENT_ENTERTAINMENT', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `categoryOther` VARCHAR(200) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `expenseDate` DATE NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'PENDING',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `adminNote` TEXT NULL,
    `paidAt` DATETIME(3) NULL,
    `receiptFileName` VARCHAR(191) NULL,
    `receiptFilePath` VARCHAR(191) NULL,
    `receiptData` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Expense_userId_expenseDate_idx`(`userId`, `expenseDate`),
    INDEX `Expense_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('CRM', 'WEBSITE', 'WHATSAPP', 'SMM', 'DDQ') NOT NULL,
    `reason` TEXT NULL,
    `ownerName` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `ownerBirthday` DATE NULL,
    `productStart` DATE NULL,
    `productEnd` DATE NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Client_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientTeamMember` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ClientTeamMember_clientId_userId_key`(`clientId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BirthdayGift` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `gift` VARCHAR(100) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BirthdayGift_userId_year_key`(`userId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BirthdayGiftReminder` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BirthdayGiftReminder_userId_year_key`(`userId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BirthdayWishSent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BirthdayWishSent_userId_year_key`(`userId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `aboutCompany` TEXT NOT NULL,
    `arnNo` VARCHAR(191) NOT NULL,
    `arnRegistration` TEXT NOT NULL,
    `euinNo` VARCHAR(191) NOT NULL,
    `cinNo` VARCHAR(191) NULL,
    `panNo` VARCHAR(191) NULL,
    `gstinNo` VARCHAR(191) NULL,
    `grievanceFirstName` VARCHAR(191) NULL,
    `grievanceLastName` VARCHAR(191) NULL,
    `grievanceEmail` VARCHAR(191) NULL,
    `grievanceContact` VARCHAR(191) NULL,
    `existingWebsite` VARCHAR(191) NULL,
    `loginLink` VARCHAR(191) NULL,
    `signupLink` VARCHAR(191) NULL,
    `ourMission` TEXT NULL,
    `ourVision` TEXT NULL,
    `ourPurpose` TEXT NULL,
    `supportPhone` VARCHAR(191) NOT NULL,
    `supportEmail` VARCHAR(191) NOT NULL,
    `addressStreet` VARCHAR(191) NULL,
    `addressLine2` VARCHAR(191) NULL,
    `addressCity` VARCHAR(191) NULL,
    `addressState` VARCHAR(191) NULL,
    `addressPostalCode` VARCHAR(191) NULL,
    `addressCountry` VARCHAR(191) NULL DEFAULT 'India',
    `hostingProvider` VARCHAR(191) NULL,
    `hostingCredentials` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OnboardingSubmission_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `kind` ENUM('LOGO', 'FOUNDER_DIRECTOR', 'TEAM', 'AWARDS_TESTIMONIALS') NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OnboardingAttachment_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Form` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lockSlug` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Form_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormViewerDepartment` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `FormViewerDepartment_formId_departmentId_key`(`formId`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormField` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `type` ENUM('SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'LINK', 'PASSWORD', 'NUMBER', 'DATE', 'DROPDOWN', 'RADIO', 'CHECKBOX', 'FILE_SINGLE', 'FILE_MULTI', 'SECTION_HEADING') NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `placeholder` VARCHAR(191) NULL,
    `helpText` TEXT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL,
    `options` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FormField_formId_order_idx`(`formId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FormSubmission_formId_createdAt_idx`(`formId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormAnswer` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `fieldId` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,

    INDEX `FormAnswer_submissionId_idx`(`submissionId`),
    INDEX `FormAnswer_fieldId_idx`(`fieldId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `fieldId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FormAttachment_submissionId_idx`(`submissionId`),
    INDEX `FormAttachment_fieldId_idx`(`fieldId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_TaskAssignees` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_TaskAssignees_AB_unique`(`A`, `B`),
    INDEX `_TaskAssignees_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ProjectAssignees` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_ProjectAssignees_AB_unique`(`A`, `B`),
    INDEX `_ProjectAssignees_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_MeetingAttendees` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_MeetingAttendees_AB_unique`(`A`, `B`),
    INDEX `_MeetingAttendees_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserModulePermission` ADD CONSTRAINT `UserModulePermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invite` ADD CONSTRAINT `Invite_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invite` ADD CONSTRAINT `Invite_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invite` ADD CONSTRAINT `Invite_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadNote` ADD CONSTRAINT `LeadNote_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadNote` ADD CONSTRAINT `LeadNote_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadActivity` ADD CONSTRAINT `LeadActivity_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadActivity` ADD CONSTRAINT `LeadActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadReminder` ADD CONSTRAINT `LeadReminder_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadReminder` ADD CONSTRAINT `LeadReminder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_projectTaskParentId_fkey` FOREIGN KEY (`projectTaskParentId`) REFERENCES `ProjectTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskComment` ADD CONSTRAINT `TaskComment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskComment` ADD CONSTRAINT `TaskComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAttachment` ADD CONSTRAINT `TaskAttachment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAttachment` ADD CONSTRAINT `TaskAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSupporter` ADD CONSTRAINT `ProjectSupporter_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSupporter` ADD CONSTRAINT `ProjectSupporter_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTimeEntry` ADD CONSTRAINT `ProjectTimeEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTimeEntry` ADD CONSTRAINT `ProjectTimeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTimeEntry` ADD CONSTRAINT `ProjectTimeEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Milestone` ADD CONSTRAINT `Milestone_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTask` ADD CONSTRAINT `ProjectTask_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTask` ADD CONSTRAINT `ProjectTask_milestoneId_fkey` FOREIGN KEY (`milestoneId`) REFERENCES `Milestone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTask` ADD CONSTRAINT `ProjectTask_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTask` ADD CONSTRAINT `ProjectTask_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTask` ADD CONSTRAINT `ProjectTask_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTask` ADD CONSTRAINT `ProjectTask_parentTaskId_fkey` FOREIGN KEY (`parentTaskId`) REFERENCES `ProjectTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTaskDependency` ADD CONSTRAINT `ProjectTaskDependency_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `ProjectTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTaskDependency` ADD CONSTRAINT `ProjectTaskDependency_dependsOnId_fkey` FOREIGN KEY (`dependsOnId`) REFERENCES `ProjectTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocument` ADD CONSTRAINT `ProjectDocument_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocument` ADD CONSTRAINT `ProjectDocument_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectActivity` ADD CONSTRAINT `ProjectActivity_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectActivity` ADD CONSTRAINT `ProjectActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationVersion` ADD CONSTRAINT `QuotationVersion_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationApproval` ADD CONSTRAINT `QuotationApproval_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationApproval` ADD CONSTRAINT `QuotationApproval_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceAudit` ADD CONSTRAINT `AttendanceAudit_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `Attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceAudit` ADD CONSTRAINT `AttendanceAudit_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLeave` ADD CONSTRAINT `UserLeave_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationMember` ADD CONSTRAINT `ConversationMember_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationMember` ADD CONSTRAINT `ConversationMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageReaction` ADD CONSTRAINT `MessageReaction_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageReaction` ADD CONSTRAINT `MessageReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageHidden` ADD CONSTRAINT `MessageHidden_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageAttachment` ADD CONSTRAINT `MessageAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CrmMember` ADD CONSTRAINT `CrmMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMember` ADD CONSTRAINT `TeamMember_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMember` ADD CONSTRAINT `TeamMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Call` ADD CONSTRAINT `Call_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Call` ADD CONSTRAINT `Call_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Call` ADD CONSTRAINT `Call_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClient` ADD CONSTRAINT `SocialClient_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClient` ADD CONSTRAINT `SocialClient_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClientFolder` ADD CONSTRAINT `SocialClientFolder_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClientFolder` ADD CONSTRAINT `SocialClientFolder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClientImage` ADD CONSTRAINT `SocialClientImage_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `SocialClientFolder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClientImage` ADD CONSTRAINT `SocialClientImage_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPlatformAccount` ADD CONSTRAINT `SocialPlatformAccount_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPlatformAccount` ADD CONSTRAINT `SocialPlatformAccount_credentialsUpdatedById_fkey` FOREIGN KEY (`credentialsUpdatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPlatformAccount` ADD CONSTRAINT `SocialPlatformAccount_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPlatformAccount` ADD CONSTRAINT `SocialPlatformAccount_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentCalendarSlot` ADD CONSTRAINT `SocialContentCalendarSlot_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentCalendarSlot` ADD CONSTRAINT `SocialContentCalendarSlot_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentItem` ADD CONSTRAINT `SocialContentItem_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentItem` ADD CONSTRAINT `SocialContentItem_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentItem` ADD CONSTRAINT `SocialContentItem_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentApproval` ADD CONSTRAINT `SocialContentApproval_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `SocialContentItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialContentApproval` ADD CONSTRAINT `SocialContentApproval_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAdCampaign` ADD CONSTRAINT `SocialAdCampaign_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAdCampaign` ADD CONSTRAINT `SocialAdCampaign_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAdCampaign` ADD CONSTRAINT `SocialAdCampaign_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialMonthlyReport` ADD CONSTRAINT `SocialMonthlyReport_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialMonthlyReport` ADD CONSTRAINT `SocialMonthlyReport_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialMonthlyReport` ADD CONSTRAINT `SocialMonthlyReport_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialReportFile` ADD CONSTRAINT `SocialReportFile_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `SocialMonthlyReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialReportFile` ADD CONSTRAINT `SocialReportFile_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClientActivity` ADD CONSTRAINT `SocialClientActivity_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `SocialClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialClientActivity` ADD CONSTRAINT `SocialClientActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntry` ADD CONSTRAINT `PasswordEntry_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntry` ADD CONSTRAINT `PasswordEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntry` ADD CONSTRAINT `PasswordEntry_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntryShare` ADD CONSTRAINT `PasswordEntryShare_passwordEntryId_fkey` FOREIGN KEY (`passwordEntryId`) REFERENCES `PasswordEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntryShare` ADD CONSTRAINT `PasswordEntryShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntryShare` ADD CONSTRAINT `PasswordEntryShare_sharedById_fkey` FOREIGN KEY (`sharedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntryActivity` ADD CONSTRAINT `PasswordEntryActivity_passwordEntryId_fkey` FOREIGN KEY (`passwordEntryId`) REFERENCES `PasswordEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordEntryActivity` ADD CONSTRAINT `PasswordEntryActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTeamMember` ADD CONSTRAINT `ClientTeamMember_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTeamMember` ADD CONSTRAINT `ClientTeamMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BirthdayGift` ADD CONSTRAINT `BirthdayGift_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BirthdayGiftReminder` ADD CONSTRAINT `BirthdayGiftReminder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BirthdayWishSent` ADD CONSTRAINT `BirthdayWishSent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingAttachment` ADD CONSTRAINT `OnboardingAttachment_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `OnboardingSubmission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Form` ADD CONSTRAINT `Form_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormViewerDepartment` ADD CONSTRAINT `FormViewerDepartment_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `Form`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormViewerDepartment` ADD CONSTRAINT `FormViewerDepartment_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormField` ADD CONSTRAINT `FormField_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `Form`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormSubmission` ADD CONSTRAINT `FormSubmission_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `Form`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAnswer` ADD CONSTRAINT `FormAnswer_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `FormSubmission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAnswer` ADD CONSTRAINT `FormAnswer_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `FormField`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAttachment` ADD CONSTRAINT `FormAttachment_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `FormSubmission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAttachment` ADD CONSTRAINT `FormAttachment_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `FormField`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_TaskAssignees` ADD CONSTRAINT `_TaskAssignees_A_fkey` FOREIGN KEY (`A`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_TaskAssignees` ADD CONSTRAINT `_TaskAssignees_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ProjectAssignees` ADD CONSTRAINT `_ProjectAssignees_A_fkey` FOREIGN KEY (`A`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ProjectAssignees` ADD CONSTRAINT `_ProjectAssignees_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MeetingAttendees` ADD CONSTRAINT `_MeetingAttendees_A_fkey` FOREIGN KEY (`A`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MeetingAttendees` ADD CONSTRAINT `_MeetingAttendees_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

