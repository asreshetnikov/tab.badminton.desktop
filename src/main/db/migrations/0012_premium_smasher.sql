CREATE TABLE `match_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`order` integer NOT NULL,
	`s1` integer DEFAULT 0 NOT NULL,
	`s2` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`team1_id` text,
	`team2_id` text,
	`winner_team_id` text,
	`s1` integer,
	`s2` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scheduled_at` text,
	`court_id` text,
	`win_match_id` text,
	`left_match_id` text,
	`right_match_id` text,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team1_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team2_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`winner_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`court_id`) REFERENCES `courts`(`id`) ON UPDATE no action ON DELETE set null
);
