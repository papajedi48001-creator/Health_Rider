-- Users can upload a profile photo; the time tells browsers when to fetch the new one.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `avatarUpdatedAt` DATETIME(3) NULL;
