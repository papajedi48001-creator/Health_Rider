-- Staff sessions end after a period without activity; this records the last request.
-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
