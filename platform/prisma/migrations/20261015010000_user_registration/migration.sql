-- People can apply for an account from the login page; it stays inactive until an admin approves it.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `pendingApproval` BOOLEAN NOT NULL DEFAULT false;
