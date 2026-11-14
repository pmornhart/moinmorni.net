CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text NOT NULL,
	`minecraft_name` text NOT NULL,
	`discord_id` text,
	`discord_name` text,
	`answers` text NOT NULL,
	`via` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`note` text,
	`discord_message_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `applications_status` ON `applications` (`status`);--> statement-breakpoint
CREATE TABLE `whitelist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`uuid` text,
	`added_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whitelist_mode_name` ON `whitelist` (`mode`,`name`);