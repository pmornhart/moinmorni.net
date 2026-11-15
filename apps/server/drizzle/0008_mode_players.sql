CREATE TABLE `mode_players` (
	`mode` text NOT NULL,
	`uuid` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`mode`, `uuid`)
);
