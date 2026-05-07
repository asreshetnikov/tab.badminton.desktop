ALTER TABLE `venues` ADD `is_demo` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `tournaments` ADD `is_demo` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `players` ADD `is_demo` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `teams` ADD `is_demo` integer NOT NULL DEFAULT 0;
