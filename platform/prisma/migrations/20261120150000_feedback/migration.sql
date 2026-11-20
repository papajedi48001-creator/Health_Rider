-- Feedback from users: the button on staff pages, and a rider's rating after each delivery. Admins read and answer it.
-- The table takes the database default character set, like every earlier table, so its keys match `users` for the foreign keys.
-- CreateTable
CREATE TABLE `feedback` (
    `id` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `role` ENUM('pharmacy', 'coordinator', 'rider', 'admin', 'auditor') NOT NULL,
    `kind` ENUM('problem', 'suggestion', 'praise', 'rating') NOT NULL,
    `rating` TINYINT NULL,
    `tags` VARCHAR(300) NULL,
    `message` VARCHAR(2000) NULL,
    `pagePath` VARCHAR(255) NULL,
    `userAgent` VARCHAR(300) NULL,
    `appVersion` VARCHAR(40) NULL,
    `deliveryAttemptId` CHAR(26) NULL,
    `hasPhoto` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('new', 'in_progress', 'resolved') NOT NULL DEFAULT 'new',
    `reply` VARCHAR(2000) NULL,
    `repliedById` CHAR(26) NULL,
    `repliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feedback_deliveryAttemptId_key`(`deliveryAttemptId`),
    INDEX `feedback_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `feedback_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `feedback_kind_createdAt_idx`(`kind`, `createdAt`),
    PRIMARY KEY (`id`)
);

-- AddForeignKey
ALTER TABLE `feedback` ADD CONSTRAINT `feedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback` ADD CONSTRAINT `feedback_repliedById_fkey` FOREIGN KEY (`repliedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
