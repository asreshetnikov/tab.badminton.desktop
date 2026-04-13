CREATE TABLE `round_table` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`team_id` text NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`sets_won` integer DEFAULT 0 NOT NULL,
	`sets_lost` integer DEFAULT 0 NOT NULL,
	`points_won` integer DEFAULT 0 NOT NULL,
	`points_lost` integer DEFAULT 0 NOT NULL,
	`position` integer,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `round_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`team_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`seed` integer,
	`checked_in` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
