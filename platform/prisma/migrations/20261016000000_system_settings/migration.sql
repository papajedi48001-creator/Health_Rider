-- Settings an admin changes from the "ตั้งค่าระบบ" page, such as the HOSxP connection.
-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `updatedById` CHAR(26) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
);
