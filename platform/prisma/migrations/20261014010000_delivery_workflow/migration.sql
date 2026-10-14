-- Sync conflicts record why and from which state; one Delivery Request per HOS visit.
-- AlterTable
ALTER TABLE `sync_conflicts` ADD COLUMN `deliveryAttemptId` CHAR(26) NOT NULL,
    ADD COLUMN `outcome` VARCHAR(50) NULL,
    ADD COLUMN `previousStatus` ENUM('prepared', 'claimed', 'in_transit', 'delivered', 'delivery_failed', 'return_required', 'returned', 'sync_review') NOT NULL,
    ADD COLUMN `reason` VARCHAR(50) NOT NULL;

-- CreateIndex
CREATE INDEX `delivery_attempts_deliveryRequestId_createdAt_idx` ON `delivery_attempts`(`deliveryRequestId`, `createdAt`);

-- CreateIndex
CREATE INDEX `delivery_attempts_status_createdAt_idx` ON `delivery_attempts`(`status`, `createdAt`);

-- CreateIndex
CREATE UNIQUE INDEX `delivery_requests_hosVisitNumber_key` ON `delivery_requests`(`hosVisitNumber`);

-- CreateIndex
CREATE INDEX `sync_conflicts_status_createdAt_idx` ON `sync_conflicts`(`status`, `createdAt`);

-- AddForeignKey
ALTER TABLE `sync_conflicts` ADD CONSTRAINT `sync_conflicts_offlineDeliveryEventId_fkey` FOREIGN KEY (`offlineDeliveryEventId`) REFERENCES `offline_delivery_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_conflicts` ADD CONSTRAINT `sync_conflicts_deliveryAttemptId_fkey` FOREIGN KEY (`deliveryAttemptId`) REFERENCES `delivery_attempts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

