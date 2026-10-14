-- Users keep a contact number they can edit on their own profile page.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(20) NULL;
