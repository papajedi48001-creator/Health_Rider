-- The phone's GPS position when the delivery photo was taken; only admins see it.
-- AlterTable
ALTER TABLE `delivery_evidence` ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `locationAccuracyM` DOUBLE NULL;
