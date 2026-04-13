CREATE TABLE `tournament_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
