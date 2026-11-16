CREATE TABLE `application_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_notes_application` ON `application_notes` (`application_id`);--> statement-breakpoint
CREATE TABLE `application_votes` (
	`application_id` integer NOT NULL,
	`voter_id` integer NOT NULL,
	`voter_name` text NOT NULL,
	`vote` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`application_id`, `voter_id`),
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stored_secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `applications` ADD `position` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `minecraft_uuid` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `lang` text;--> statement-breakpoint
ALTER TABLE `discord_objects` ADD `created` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `discord_objects` ADD `applied` text;