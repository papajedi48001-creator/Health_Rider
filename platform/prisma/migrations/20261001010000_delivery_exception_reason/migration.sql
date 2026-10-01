-- Preserve the standard reason for a failed delivery so operations can audit and resolve returns.
ALTER TABLE `delivery_attempts` ADD COLUMN `failureReason` VARCHAR(100) NULL;
