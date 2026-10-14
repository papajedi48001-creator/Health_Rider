-- Server-side sessions so accounts can be revoked or deactivated immediately.
CREATE TABLE `sessions` (`id` CHAR(26) NOT NULL, `tokenHash` CHAR(64) NOT NULL, `userId` CHAR(26) NOT NULL, `expiresAt` DATETIME(3) NOT NULL, `revokedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE INDEX `sessions_tokenHash_key`(`tokenHash`), INDEX `sessions_userId_idx`(`userId`), PRIMARY KEY (`id`));
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
