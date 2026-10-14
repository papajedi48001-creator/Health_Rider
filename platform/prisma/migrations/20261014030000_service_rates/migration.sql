-- Baht-per-delivery rates by zone or whole subdistrict, and the rate each request was confirmed at.
-- AlterTable
ALTER TABLE `delivery_requests` ADD COLUMN `rateEffectiveFrom` DATE NULL,
    ADD COLUMN `rateSatang` INTEGER NULL;

-- CreateTable
CREATE TABLE `service_rates` (
    `id` CHAR(26) NOT NULL,
    `subdistrictCode` VARCHAR(32) NOT NULL,
    `deliveryZoneId` CHAR(26) NULL,
    `rateSatang` INTEGER NOT NULL,
    `effectiveFrom` DATE NOT NULL,
    `createdById` CHAR(26) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_rates_subdistrictCode_effectiveFrom_idx`(`subdistrictCode`, `effectiveFrom`),
    INDEX `service_rates_deliveryZoneId_effectiveFrom_idx`(`deliveryZoneId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
);

-- AddForeignKey
ALTER TABLE `service_rates` ADD CONSTRAINT `service_rates_deliveryZoneId_fkey` FOREIGN KEY (`deliveryZoneId`) REFERENCES `delivery_zones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_rates` ADD CONSTRAINT `service_rates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
