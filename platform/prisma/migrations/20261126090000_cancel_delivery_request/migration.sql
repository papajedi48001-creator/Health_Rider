-- Pharmacy can cancel a job that already has delivery history (e.g. medication came back and the patient no longer needs delivery).
-- The row stays, so its history stays and the HOSxP visit does not return to the confirm list.
-- AlterTable
ALTER TABLE `delivery_requests` ADD COLUMN `cancelledAt` DATETIME(3) NULL;
