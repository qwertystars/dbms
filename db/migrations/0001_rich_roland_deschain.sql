CREATE TABLE `dna_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_low_id` text NOT NULL,
	`account_high_id` text NOT NULL,
	`reporter_account_id` text NOT NULL,
	`provider` text NOT NULL,
	`shared_cm` real NOT NULL,
	`shared_segments` integer,
	`note` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`account_low_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_high_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `help_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`author_account_id` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`audience` text DEFAULT 'FAMILY' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `help_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`help_request_id` text NOT NULL,
	`author_account_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`help_request_id`) REFERENCES `help_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `families` ADD `close_family_degree` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `education` text;--> statement-breakpoint
ALTER TABLE `people` ADD `city` text;--> statement-breakpoint
ALTER TABLE `people` ADD `skills` text;--> statement-breakpoint
ALTER TABLE `people` ADD `field_visibility` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `audience` text DEFAULT 'FAMILY' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `dna_matches_pair` ON `dna_matches` (`account_low_id`,`account_high_id`);--> statement-breakpoint
CREATE INDEX `dna_matches_account_high_id` ON `dna_matches` (`account_high_id`);--> statement-breakpoint
CREATE INDEX `help_requests_family_id_status` ON `help_requests` (`family_id`,`status`);--> statement-breakpoint
CREATE INDEX `help_responses_help_request_id` ON `help_responses` (`help_request_id`);