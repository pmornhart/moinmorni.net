CREATE TABLE `friend_requests` (
	`from_uuid` text NOT NULL,
	`to_uuid` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`from_uuid`, `to_uuid`)
);
--> statement-breakpoint
CREATE INDEX `friend_requests_to` ON `friend_requests` (`to_uuid`);--> statement-breakpoint
CREATE TABLE `friends` (
	`a` text NOT NULL,
	`b` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`a`, `b`)
);
--> statement-breakpoint
CREATE INDEX `friends_b` ON `friends` (`b`);