ALTER TABLE `events` ADD `age_min` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `age_max` integer;--> statement-breakpoint
ALTER TABLE `rounds` DROP COLUMN `age_min`;--> statement-breakpoint
ALTER TABLE `rounds` DROP COLUMN `age_max`;