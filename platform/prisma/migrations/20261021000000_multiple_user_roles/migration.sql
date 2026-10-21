-- An account may hold several roles and picks one after signing in; users may ask for more on their profile.
-- Tables take the database default character set, like every earlier table, so their keys match `users` for the foreign keys.
-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `activeRole` ENUM('pharmacy', 'coordinator', 'rider', 'admin', 'auditor') NULL;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` CHAR(26) NOT NULL,
    `role` ENUM('pharmacy', 'coordinator', 'rider', 'admin', 'auditor') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `role`)
);

-- CreateTable
CREATE TABLE `role_requests` (
    `id` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `role` ENUM('pharmacy', 'coordinator', 'rider', 'admin', 'auditor') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `decidedById` CHAR(26) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_requests_userId_status_idx`(`userId`, `status`),
    INDEX `role_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
);

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_requests` ADD CONSTRAINT `role_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_requests` ADD CONSTRAINT `role_requests_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Every existing account keeps the one role it had. Applications still waiting get theirs when an admin approves.
INSERT INTO `user_roles` (`userId`, `role`) SELECT `id`, `role` FROM `users` WHERE `pendingApproval` = false;
