CREATE TABLE `modes` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`uuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role_id` text,
	`language` text,
	`bedrock` integer DEFAULT false NOT NULL,
	`private_profile` integer DEFAULT false NOT NULL,
	`discord_id` text,
	`first_seen` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`play_minutes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_name` ON `players` (`name`);--> statement-breakpoint
CREATE TABLE `punishments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`by_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`revoked_by` text
);
--> statement-breakpoint
CREATE INDEX `punishments_player` ON `punishments` (`player_uuid`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setting_values` (
	`area` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`area`, `key`)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`motor_user_id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
