DROP TABLE `tournament_teams`;
--> statement-breakpoint
CREATE TABLE `tournament_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`event_id` text NOT NULL,
	`team_id` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
