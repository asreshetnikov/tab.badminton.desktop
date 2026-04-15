CREATE TABLE `tournament_day_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `tournament_id` text NOT NULL REFERENCES `tournaments`(`id`) ON DELETE CASCADE,
  `date` text NOT NULL,
  `start_time` text NOT NULL,
  `match_duration` integer NOT NULL
);
