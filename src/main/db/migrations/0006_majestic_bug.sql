CREATE TABLE `tournament_players` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`player_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`registered_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
