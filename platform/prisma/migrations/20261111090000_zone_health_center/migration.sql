-- Each delivery zone may name the รพ.สต. that looks after it, so the parcel label can print it.
-- AlterTable
ALTER TABLE `delivery_zones` ADD COLUMN `healthCenterId` CHAR(26) NULL;

-- CreateIndex
CREATE INDEX `delivery_zones_healthCenterId_fkey` ON `delivery_zones`(`healthCenterId`);

-- AddForeignKey
ALTER TABLE `delivery_zones` ADD CONSTRAINT `delivery_zones_healthCenterId_fkey` FOREIGN KEY (`healthCenterId`) REFERENCES `health_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
