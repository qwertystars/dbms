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
export const audienceEnum = ["FAMILY", "CLOSE"] as const;
export const helpKindEnum = ["REQUEST", "OFFER"] as const;
export const helpCategoryEnum = [
  "ADVICE",
  "CAREER",
  "EDUCATION",
  "HEALTH",
  "HOUSING",
  "TRAVEL",
  "CARE",
  "OTHER",
] as const;
export const helpStatusEnum = ["OPEN", "RESOLVED", "CLOSED"] as const;
export const dnaProviderEnum = [
  "ANCESTRY",
  "TWENTY_THREE_AND_ME",
  "MYHERITAGE",
  "FTDNA",
  "GEDMATCH",
  "OTHER",
] as const;
export const dnaMatchStatusEnum = ["PENDING", "CONFIRMED"] as const;

export type FamilyRole = (typeof familyRoleEnum)[number];
export type InvitationRole = (typeof invitationRoleEnum)[number];
export type ReactionType = (typeof reactionTypeEnum)[number];
export type MediaPurpose = (typeof mediaPurposeEnum)[number];
export type MediaStatus = (typeof mediaStatusEnum)[number];
export type FriendRequestStatus = (typeof friendRequestStatusEnum)[number];
export type Audience = (typeof audienceEnum)[number];
export type HelpKind = (typeof helpKindEnum)[number];
export type HelpCategory = (typeof helpCategoryEnum)[number];
export type HelpStatus = (typeof helpStatusEnum)[number];
export type DnaProvider = (typeof dnaProviderEnum)[number];
export type DnaMatchStatus = (typeof dnaMatchStatusEnum)[number];

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
  /** Kinship degree up to which relatives count as close family (see RULE-CIRCLE-01). */
  closeFamilyDegree: integer("close_family_degree").notNull().default(3),
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
    education: text("education"),
    city: text("city"),
    skills: text("skills"),
    biography: text("biography"),
    /** Per field-group visibility overrides; missing groups use the defaults. */
    fieldVisibility: text("field_visibility", { mode: "json" }).$type<Record<string, string>>(),
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
    audience: text("audience", { enum: audienceEnum }).notNull().default("FAMILY"),
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

export const helpRequests = sqliteTable(
  "help_requests",
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
    kind: text("kind", { enum: helpKindEnum }).notNull(),
    category: text("category", { enum: helpCategoryEnum }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    audience: text("audience", { enum: audienceEnum }).notNull().default("FAMILY"),
    status: text("status", { enum: helpStatusEnum }).notNull().default("OPEN"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => ({
    familyStatusIdx: index("help_requests_family_id_status").on(table.familyId, table.status),
  }),
);

export const helpResponses = sqliteTable(
  "help_responses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    helpRequestId: text("help_request_id")
      .notNull()
      .references(() => helpRequests.id),
    authorAccountId: text("author_account_id")
      .notNull()
      .references(() => accounts.id),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => ({
    requestIdx: index("help_responses_help_request_id").on(table.helpRequestId),
  }),
);

/**
 * A DNA relative match reported by one account and confirmed by the other.
 * Only the summary a testing provider shows (shared centimorgans) is stored,
 * never raw genetic data. The pair is canonically ordered so there is at most
 * one match per two accounts.
 */
export const dnaMatches = sqliteTable(
  "dna_matches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    accountLowId: text("account_low_id")
      .notNull()
      .references(() => accounts.id),
    accountHighId: text("account_high_id")
      .notNull()
      .references(() => accounts.id),
    reporterAccountId: text("reporter_account_id")
      .notNull()
      .references(() => accounts.id),
    provider: text("provider", { enum: dnaProviderEnum }).notNull(),
    sharedCm: real("shared_cm").notNull(),
    sharedSegments: integer("shared_segments"),
    note: text("note"),
    status: text("status", { enum: dnaMatchStatusEnum }).notNull().default("PENDING"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  },
  (table) => ({
    pairUq: uniqueIndex("dna_matches_pair").on(table.accountLowId, table.accountHighId),
    highIdx: index("dna_matches_account_high_id").on(table.accountHighId),
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
