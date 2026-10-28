export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  UNAUTHENTICATED: () => new AppError("UNAUTHENTICATED", "Authentication required.", 401),
  FORBIDDEN: (message = "You do not have permission to perform this action.") =>
    new AppError("FORBIDDEN", message, 403),
  NOT_FOUND: (message = "Resource not found.") => new AppError("NOT_FOUND", message, 404),
  CONFLICT: (message = "Resource conflict.") => new AppError("CONFLICT", message, 409),
  VALIDATION: (message = "Invalid input.") => new AppError("VALIDATION", message, 400),
  RATE_LIMIT: () => new AppError("RATE_LIMIT", "Too many requests.", 429),

  PERSON_NOT_IN_FAMILY: (message = "Person does not belong to this family.") =>
    new AppError("PERSON_NOT_IN_FAMILY", message, 409),
  TREE_SELF_EDGE: () =>
    new AppError("TREE_SELF_EDGE", "A person cannot be their own parent or child.", 409),
  TREE_DUPLICATE_EDGE: (message = "This relationship already exists.") =>
    new AppError("TREE_DUPLICATE_EDGE", message, 409),
  TREE_CYCLE: (message = "This relationship would create an ancestry cycle.") =>
    new AppError("TREE_CYCLE", message, 409),
  PARTNER_SELF: () => new AppError("PARTNER_SELF", "A person cannot be their own partner.", 409),
  PARTNER_DUPLICATE: (message = "These people are already recorded as partners.") =>
    new AppError("PARTNER_DUPLICATE", message, 409),
  CLAIM_PENDING: (message = "You already have a pending claim in this family.") =>
    new AppError("CLAIM_PENDING", message, 409),
  CLAIM_ALREADY_LINKED: (message = "Your membership is already linked to a person.") =>
    new AppError("CLAIM_ALREADY_LINKED", message, 409),
  CLAIM_CONFLICT: (message = "This person is already linked to another member.") =>
    new AppError("CLAIM_CONFLICT", message, 409),
  CLAIM_NOT_PENDING: (message = "This claim request has already been decided.") =>
    new AppError("CLAIM_NOT_PENDING", message, 409),
  INVITATION_EXPIRED: (message = "Invitation has expired.") =>
    new AppError("INVITATION_EXPIRED", message, 400),
  INVITATION_USED: (message = "Invitation has already been used.") =>
    new AppError("INVITATION_USED", message, 409),
  FRIEND_SELF: () =>
    new AppError("FRIEND_SELF", "You cannot send a friend request to yourself.", 409),
  FRIEND_DUPLICATE: (message = "A pending request already exists.") =>
    new AppError("FRIEND_DUPLICATE", message, 409),
  MEDIA_INVALID: (message = "Invalid media upload.") => new AppError("MEDIA_INVALID", message, 422),
} as const;
