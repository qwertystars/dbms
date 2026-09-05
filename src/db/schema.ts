import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  check,
  bigint,
  date,
  numeric,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const familyRoleEnum = pgEnum("family_role", ["CREATOR", "EDITOR", "VIEWER"]);
export const invitationRoleEnum = pgEnum("invitation_role", ["EDITOR", "VIEWER"]);
export const reactionTypeEnum = pgEnum("reaction_type", ["LIKE", "LOVE", "LAUGH", "SAD"]);
export const mediaPurposeEnum = pgEnum("media_purpose", [
  "ACCOUNT_AVATAR",
  "PERSON_PROFILE",
  "POST_ATTACHMENT",
]);
export const mediaStatusEnum = pgEnum("media_status", ["PENDING", "READY", "DELETING", "DELETED"]);
export const friendRequestStatusEnum = pgEnum("friend_request_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authSubject: text("auth_subject").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarMediaId: uuid("avatar_media_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerAccountId: uuid("owner_account_id")
    .notNull()
    .references(() => accounts.id),
  familyId: uuid("family_id").references(() => families.id),
  purpose: mediaPurposeEnum("purpose").notNull(),
  objectKey: text("object_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sha256: text("sha256"),
  status: mediaStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp("ready_at", { withTimezone: true }),
});

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    name: text("name").notNull(),
    gender: text("gender").notNull(),
    dateOfBirth: date("date_of_birth"),
    dateOfDeath: date("date_of_death"),
    heightCm: numeric("height_cm"),
    weightKg: numeric("weight_kg"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    occupation: text("occupation"),
    biography: text("biography"),
    profileMediaId: uuid("profile_media_id").references(() => mediaAssets.id),
    createdByAccountId: uuid("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    familyDeletedAtIdx: index("people_family_id_deleted_at").on(table.familyId, table.deletedAt),
    lifeDatesCheck: check(
      "people_life_dates",
      sql`date_of_death IS NULL OR date_of_birth IS NULL OR date_of_death >= date_of_birth`,
    ),
  }),
);

export const familyMemberships = pgTable(
  "family_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    personId: uuid("person_id").references(() => people.id),
    role: familyRoleEnum("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
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

export const familyInvitations = pgTable("family_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id),
  createdByAccountId: uuid("created_by_account_id")
    .notNull()
    .references(() => accounts.id),
  invitedEmail: text("invited_email"),
  role: invitationRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByAccountId: uuid("accepted_by_account_id").references(() => accounts.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parentChildRelationships = pgTable(
  "parent_child_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    parentPersonId: uuid("parent_person_id")
      .notNull()
      .references(() => people.id),
    childPersonId: uuid("child_person_id")
      .notNull()
      .references(() => people.id),
    createdByAccountId: uuid("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    authorAccountId: uuid("author_account_id")
      .notNull()
      .references(() => accounts.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    familyCreatedAtIdx: index("posts_family_id_created_at").on(table.familyId, table.createdAt),
  }),
);

export const postMedia = pgTable(
  "post_media",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    mediaAssetId: uuid("media_asset_id")
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

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id),
  authorAccountId: uuid("author_account_id")
    .notNull()
    .references(() => accounts.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const reactions = pgTable(
  "reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    type: reactionTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.postId, table.accountId],
      name: "reactions_pkey",
    }),
  }),
);

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderAccountId: uuid("sender_account_id")
      .notNull()
      .references(() => accounts.id),
    receiverAccountId: uuid("receiver_account_id")
      .notNull()
      .references(() => accounts.id),
    status: friendRequestStatusEnum("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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

export const friendships = pgTable(
  "friendships",
  {
    accountLowId: uuid("account_low_id")
      .notNull()
      .references(() => accounts.id),
    accountHighId: uuid("account_high_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.accountLowId, table.accountHighId],
      name: "friendships_pkey",
    }),
    noSelfCheck: check("friendships_no_self", sql`${table.accountLowId} <> ${table.accountHighId}`),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id").references(() => families.id),
    actorAccountId: uuid("actor_account_id").references(() => accounts.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    summary: jsonb("summary").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    familyCreatedAtIdx: index("audit_events_family_id_created_at").on(
      table.familyId,
      table.createdAt,
    ),
  }),
);
