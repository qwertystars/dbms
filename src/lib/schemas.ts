import { z } from "zod";

export const uuidSchema = z.string().min(1).max(64);

export const roleSchema = z.enum(["CREATOR", "EDITOR", "VIEWER"]);
export const invitationRoleSchema = z.enum(["EDITOR", "VIEWER"]);
export const reactionTypeSchema = z.enum(["LIKE", "LOVE", "LAUGH", "SAD"]);
export const mediaPurposeSchema = z.enum(["ACCOUNT_AVATAR", "PERSON_PROFILE", "POST_ATTACHMENT"]);

export const familyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export const familyUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
});

export const personCreateSchema = z.object({
  name: z.string().min(1).max(255),
  gender: z.string().min(1).max(50),
  dateOfBirth: z.string().date().optional().nullable(),
  dateOfDeath: z.string().date().optional().nullable(),
  heightCm: z.coerce.number().positive().optional().nullable(),
  weightKg: z.coerce.number().positive().optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  occupation: z.string().max(255).optional().nullable(),
  biography: z.string().max(5000).optional().nullable(),
  profileMediaId: uuidSchema.optional().nullable(),
});

export const personUpdateSchema = personCreateSchema.partial();

export const parentChildEdgeSchema = z.object({
  parentPersonId: uuidSchema,
  childPersonId: uuidSchema,
});

export const invitationCreateSchema = z.object({
  email: z.string().email().max(255).optional(),
  role: invitationRoleSchema,
});

export const membershipUpdateSchema = z.object({
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const ownershipTransferSchema = z.object({
  newCreatorMembershipId: uuidSchema,
});

export const postCreateSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const postUpdateSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const commentCreateSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const commentUpdateSchema = commentCreateSchema;

export const reactionSchema = z.object({
  type: reactionTypeSchema,
});

export const friendRequestSchema = z.object({
  accountId: uuidSchema,
});

export const uploadIntentSchema = z.object({
  purpose: mediaPurposeSchema,
  familyId: uuidSchema.optional(),
  mimeType: z.string().min(1).max(255),
  size: z.coerce
    .number()
    .positive()
    .max(50 * 1024 * 1024),
});

export const uploadCompleteSchema = z.object({
  sha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
});

export const accountUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export const authConfigSchema = z.object({
  provider: z.enum(["oidc", "google"]),
  devSignIn: z.boolean(),
  googleSignIn: z.boolean(),
});
