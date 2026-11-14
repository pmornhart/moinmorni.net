CREATE TABLE `discord_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
