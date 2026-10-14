-- Zones keep the HOS subdistrict name so pharmacy can pick a subdistrict before a zone.
-- AlterTable
ALTER TABLE `delivery_zones` ADD COLUMN `subdistrictName` VARCHAR(255) NULL;
