CREATE TABLE `mode_stats` (
	`mode` text NOT NULL,
	`uuid` text NOT NULL,
	`key` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`mode`, `uuid`, `key`)
);
--> statement-breakpoint
CREATE INDEX `mode_stats_rank` ON `mode_stats` (`mode`,`key`,`value`);