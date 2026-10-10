CREATE TABLE account_credentials (
  account_id text PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  salt text NOT NULL
);
--> statement-breakpoint
CREATE TABLE account_sessions (
  token_hash text PRIMARY KEY NOT NULL,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX account_credentials_username_unique ON account_credentials(username);
