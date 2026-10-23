import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  check,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const familyRoleEnum = ["CREATOR", "EDITOR", "VIEWER"] as const;
export const invitationRoleEnum = ["EDITOR", "VIEWER"] as const;
export const reactionTypeEnum = ["LIKE", "LOVE", "LAUGH", "SAD"] as const;
export const mediaPurposeEnum = ["ACCOUNT_AVATAR", "PERSON_PROFILE", "POST_ATTACHMENT"] as const;
export const mediaStatusEnum = ["PENDING", "READY", "DELETING", "DELETED"] as const;
export const friendRequestStatusEnum = ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"] as const;
export const claimStatusEnum = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const rsvpResponseEnum = ["GOING", "MAYBE", "NOT_GOING"] as const;

export type FamilyRole = (typeof familyRoleEnum)[number];
export type InvitationRole = (typeof invitationRoleEnum)[number];
export type ReactionType = (typeof reactionTypeEnum)[number];
export type MediaPurpose = (typeof mediaPurposeEnum)[number];
export type MediaStatus = (typeof mediaStatusEnum)[number];
export type FriendRequestStatus = (typeof friendRequestStatusEnum)[number];
export type ClaimStatus = (typeof claimStatusEnum)[number];
export type RsvpResponse = (typeof rsvpResponseEnum)[number];

export const accounts = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  authSubject: text("auth_subject").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarMediaId: text("avatar_media_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const families = sqliteTable("families", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  ownerAccountId: text("owner_account_id")
    .notNull()
    .references(() => accounts.id),
  familyId: text("family_id").references(() => families.id),
  purpose: text("purpose", { enum: mediaPurposeEnum }).notNull(),
  objectKey: text("object_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256"),
  status: text("status", { enum: mediaStatusEnum }).notNull().default("PENDING"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  readyAt: integer("ready_at", { mode: "timestamp" }),
});

export const people = sqliteTable(
  "people",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    name: text("name").notNull(),
    gender: text("gender").notNull(),
    dateOfBirth: text("date_of_birth"),
    dateOfDeath: text("date_of_death"),
    heightCm: real("height_cm"),
    weightKg: real("weight_kg"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    occupation: text("occupation"),
    biography: text("biography"),
    profileMediaId: text("profile_media_id").references(() => mediaAssets.id),
    createdByAccountId: text("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => ({
    familyDeletedAtIdx: index("people_family_id_deleted_at").on(table.familyId, table.deletedAt),
    lifeDatesCheck: check(
      "people_life_dates",
      sql`date_of_death IS NULL OR date_of_birth IS NULL OR date_of_death >= date_of_birth`,
    ),
  }),
);

export const familyMemberships = sqliteTable(
  "family_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    personId: text("person_id").references(() => people.id),
    role: text("role", { enum: familyRoleEnum }).notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    removedAt: integer("removed_at", { mode: "timestamp" }),
  },
  (table) => ({
    familyAccountActiveUq: uniqueIndex("family_memberships_family_account_active")
      .on(table.familyId, table.accountId)
      .where(sql`${table.removedAt} IS NULL`),
    familyPersonActiveUq: uniqueIndex("family_memberships_family_person_active")
      .on(table.familyId, table.personId)
      .where(sql`${table.removedAt} IS NULL AND ${table.personId} IS NOT NULL`),
    accountRemovedAtIdx: index("family_memberships_account_id_removed_at").on(
      table.accountId,
      table.removedAt,
    ),
  }),
);

export const familyInvitations = sqliteTable("family_invitations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id),
  createdByAccountId: text("created_by_account_id")
    .notNull()
    .references(() => accounts.id),
  invitedEmail: text("invited_email"),
  role: text("role", { enum: invitationRoleEnum }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  acceptedByAccountId: text("accepted_by_account_id").references(() => accounts.id),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const parentChildRelationships = sqliteTable(
  "parent_child_relationships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    parentPersonId: text("parent_person_id")
      .notNull()
      .references(() => people.id),
    childPersonId: text("child_person_id")
      .notNull()
      .references(() => people.id),
    createdByAccountId: text("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueEdge: uniqueIndex("parent_child_family_parent_child_unique").on(
      table.familyId,
      table.parentPersonId,
      table.childPersonId,
    ),
    parentIdx: index("parent_child_relationships_parent_person_id").on(table.parentPersonId),
    childIdx: index("parent_child_relationships_child_person_id").on(table.childPersonId),
    noSelfCheck: check(
      "parent_child_no_self",
      sql`${table.parentPersonId} <> ${table.childPersonId}`,
    ),
  }),
);

// A partner pair is stored once, with personAId < personBId.
export const partnerRelationships = sqliteTable(
  "partner_relationships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    personAId: text("person_a_id")
      .notNull()
      .references(() => people.id),
    personBId: text("person_b_id")
      .notNull()
      .references(() => people.id),
    createdByAccountId: text("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    uniquePair: uniqueIndex("partner_family_pair_unique").on(
      table.familyId,
      table.personAId,
      table.personBId,
    ),
    orderedCheck: check("partner_ordered_pair", sql`${table.personAId} < ${table.personBId}`),
  }),
);

export const personClaimRequests = sqliteTable(
  "person_claim_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    membershipId: text("membership_id")
      .notNull()
      .references(() => familyMemberships.id),
    requesterAccountId: text("requester_account_id")
      .notNull()
      .references(() => accounts.id),
    status: text("status", { enum: claimStatusEnum }).notNull().default("PENDING"),
    decidedByAccountId: text("decided_by_account_id").references(() => accounts.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
  },
  (table) => ({
    onePendingPerMembership: uniqueIndex("person_claim_requests_membership_pending")
      .on(table.membershipId)
      .where(sql`${table.status} = 'PENDING'`),
    familyStatusIdx: index("person_claim_requests_family_status").on(table.familyId, table.status),
  }),
);

export const familyEvents = sqliteTable(
  "family_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    title: text("title").notNull(),
    description: text("description"),
    startsOn: text("starts_on").notNull(),
    startTime: text("start_time"),
    location: text("location"),
    createdByAccountId: text("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => ({
    familyStartsOnIdx: index("family_events_family_starts_on").on(table.familyId, table.startsOn),
  }),
);

export const eventRsvps = sqliteTable(
  "event_rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => familyEvents.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    response: text("response", { enum: rsvpResponseEnum }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.accountId], name: "event_rsvps_pkey" }),
  }),
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    authorAccountId: text("author_account_id")
      .notNull()
      .references(() => accounts.id),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => ({
    familyCreatedAtIdx: index("posts_family_id_created_at").on(table.familyId, table.createdAt),
  }),
);

export const postMedia = sqliteTable(
  "post_media",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    mediaAssetId: text("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.postId, table.mediaAssetId],
      name: "post_media_pkey",
    }),
  }),
);

export const postPersonTags = sqliteTable(
  "post_person_tags",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.personId], name: "post_person_tags_pkey" }),
    personIdx: index("post_person_tags_person_id").on(table.personId),
  }),
);

export const comments = sqliteTable("comments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id),
  authorAccountId: text("author_account_id")
    .notNull()
    .references(() => accounts.id),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const reactions = sqliteTable(
  "reactions",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    type: text("type", { enum: reactionTypeEnum }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.postId, table.accountId],
      name: "reactions_pkey",
    }),
  }),
);

export const friendRequests = sqliteTable(
  "friend_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    senderAccountId: text("sender_account_id")
      .notNull()
      .references(() => accounts.id),
    receiverAccountId: text("receiver_account_id")
      .notNull()
      .references(() => accounts.id),
    status: text("status", { enum: friendRequestStatusEnum }).notNull().default("PENDING"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (table) => ({
    noSelfCheck: check(
      "friend_requests_no_self",
      sql`${table.senderAccountId} <> ${table.receiverAccountId}`,
    ),
    receiverStatusIdx: index("friend_requests_receiver_status").on(
      table.receiverAccountId,
      table.status,
    ),
  }),
);

export const friendships = sqliteTable(
  "friendships",
  {
    accountLowId: text("account_low_id")
      .notNull()
      .references(() => accounts.id),
    accountHighId: text("account_high_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.accountLowId, table.accountHighId],
      name: "friendships_pkey",
    }),
    noSelfCheck: check("friendships_no_self", sql`${table.accountLowId} <> ${table.accountHighId}`),
  }),
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    familyId: text("family_id").references(() => families.id),
    actorAccountId: text("actor_account_id").references(() => accounts.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    summary: text("summary", { mode: "json" }).notNull(),
    requestId: text("request_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    familyCreatedAtIdx: index("audit_events_family_id_created_at").on(
      table.familyId,
      table.createdAt,
    ),
  }),
);

// OAuth handshakes and app sessions store only hashes of browser credentials.
export const oauthAttempts = sqliteTable("oauth_attempts", {
  stateHash: text("state_hash").primaryKey(),
  nonce: text("nonce").notNull(),
  verifier: text("verifier").notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  subject: text("subject").notNull(),
  displayName: text("display_name").notNull(),
  expiresAt: integer("expires_at").notNull(),
  credentialVersion: integer("credential_version").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
});

export const accountCredentials = sqliteTable("account_credentials", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  authSubject: text("auth_subject").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
