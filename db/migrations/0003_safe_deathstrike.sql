CREATE TABLE `event_rsvps` (
	`event_id` text NOT NULL,
	`account_id` text NOT NULL,
	`response` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `event_id`),
	FOREIGN KEY (`event_id`) REFERENCES `family_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `family_events` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`starts_on` text NOT NULL,
	`start_time` text,
	`location` text,
	`created_by_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partner_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`person_a_id` text NOT NULL,
	`person_b_id` text NOT NULL,
	`created_by_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `partner_ordered_pair` CHECK (`person_a_id` < `person_b_id`),
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_a_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_b_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `person_claim_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`person_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`requester_account_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`decided_by_account_id` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`membership_id`) REFERENCES `family_memberships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `post_person_tags` (
	`post_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`person_id`, `post_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `family_events_family_starts_on` ON `family_events` (`family_id`,`starts_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `partner_family_pair_unique` ON `partner_relationships` (`family_id`,`person_a_id`,`person_b_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_claim_requests_membership_pending` ON `person_claim_requests` (`membership_id`) WHERE "person_claim_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX `person_claim_requests_family_status` ON `person_claim_requests` (`family_id`,`status`);--> statement-breakpoint
CREATE INDEX `post_person_tags_person_id` ON `post_person_tags` (`person_id`);
