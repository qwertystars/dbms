CREATE TABLE `account_credentials` (
	`account_id` text PRIMARY KEY NOT NULL,
	`auth_subject` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `credential_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `account_credentials_auth_subject_unique` ON `account_credentials` (`auth_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_credentials_username_unique` ON `account_credentials` (`username`);