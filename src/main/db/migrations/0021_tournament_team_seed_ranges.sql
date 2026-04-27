ALTER TABLE `tournament_teams` ADD `seed_lo` integer;--> statement-breakpoint
ALTER TABLE `tournament_teams` ADD `seed_hi` integer;--> statement-breakpoint
UPDATE `tournament_teams`
SET
  `seed_lo` = (
    SELECT `round_teams`.`seed_lo`
    FROM `round_teams`
    INNER JOIN `rounds` ON `rounds`.`id` = `round_teams`.`round_id`
    WHERE `rounds`.`event_id` = `tournament_teams`.`event_id`
      AND `round_teams`.`team_id` = `tournament_teams`.`team_id`
      AND `round_teams`.`seed_lo` IS NOT NULL
    LIMIT 1
  ),
  `seed_hi` = (
    SELECT `round_teams`.`seed_hi`
    FROM `round_teams`
    INNER JOIN `rounds` ON `rounds`.`id` = `round_teams`.`round_id`
    WHERE `rounds`.`event_id` = `tournament_teams`.`event_id`
      AND `round_teams`.`team_id` = `tournament_teams`.`team_id`
      AND `round_teams`.`seed_lo` IS NOT NULL
    LIMIT 1
  );
