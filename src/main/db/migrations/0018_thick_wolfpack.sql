CREATE TABLE `tournament_stage_durations` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`bracket_round` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `matches` ADD `not_before_hard` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `not_before_soft` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `actual_start` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `actual_end` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `rest_minutes` integer;