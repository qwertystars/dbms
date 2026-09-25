import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { app } from "~/lib/hono";
import { Errors } from "~/lib/errors";
import {
  familyCreateSchema,
  familyUpdateSchema,
  personCreateSchema,
  personUpdateSchema,
  parentChildEdgeSchema,
  invitationCreateSchema,
  membershipUpdateSchema,
  membershipPersonSchema,
  helpCreateSchema,
  helpUpdateSchema,
  helpResponseSchema,
  helpKindSchema,
  helpStatusSchema,
  dnaMatchCreateSchema,
  ownershipTransferSchema,
  postCreateSchema,
  postUpdateSchema,
  commentCreateSchema,
  commentUpdateSchema,
  reactionSchema,
  friendRequestSchema,
  uploadIntentSchema,
  uploadCompleteSchema,
  accountUpdateSchema,
  uuidSchema,
} from "~/lib/schemas";
import * as accountService from "~/modules/accounts/service";
import * as familyService from "~/modules/families/service";
import * as peopleService from "~/modules/people/service";
import * as treeService from "~/modules/tree/service";
import * as socialService from "~/modules/social/service";
import * as friendsService from "~/modules/friends/service";
import * as mediaService from "~/modules/media/service";
import * as exportService from "~/modules/export/service";
import * as eventsService from "~/modules/events/service";
import * as helpService from "~/modules/help/service";
import * as dnaService from "~/modules/dna/service";
import { loadViewerContext } from "~/modules/kinship/service";
import { presentPerson } from "~/modules/people/visibility";
import type { Account } from "~/lib/context";
import { getFamily } from "~/modules/families/service";

function requireAccount(c: any): Account {
  const account = c.get("ctx").account;
  if (!account) throw Errors.UNAUTHENTICATED();
  return account;
}

const familyIdParam = z.object({ familyId: uuidSchema });
const personIdParam = z.object({ familyId: uuidSchema, personId: uuidSchema });
const postIdParam = z.object({ familyId: uuidSchema, postId: uuidSchema });
const commentIdParam = z.object({ familyId: uuidSchema, commentId: uuidSchema });
const relationshipIdParam = z.object({ familyId: uuidSchema, relationshipId: uuidSchema });
const helpIdParam = z.object({ familyId: uuidSchema, helpId: uuidSchema });

// Accounts
function serializeMe(account: Account) {
  return {
    id: account.id,
    authSubject: account.authSubject,
    displayName: account.displayName,
    avatarMediaId: account.avatarMediaId,
    createdAt: account.createdAt,
  };
}

app.get("/me", (c) => c.json(serializeMe(requireAccount(c))));

app.patch("/me", zValidator("json", accountUpdateSchema), async (c) => {
  const account = requireAccount(c);
  const updated = await accountService.updateAccount(account, c.req.valid("json"));
  return c.json(serializeMe(updated));
});

// Events
const upcomingQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(45),
});

app.get("/events/upcoming", zValidator("query", upcomingQuery), async (c) => {
  const account = requireAccount(c);
  const { days } = c.req.valid("query");
  const events = await eventsService.listUpcomingEvents(account, days);
  return c.json({ events });
});

// Families
app.post("/families", zValidator("json", familyCreateSchema), async (c) => {
  const account = requireAccount(c);
  const body = c.req.valid("json");
  const result = await familyService.createFamily(account, body);
  return c.json({ family: result.family, membership: result.membership }, 201);
});

app.get("/families", async (c) => {
  const account = requireAccount(c);
  const rows = await familyService.listFamilies(account);
  return c.json({
    families: rows.map((r) => ({
      family: r.family,
      membership: r.membership,
    })),
  });
});

app.get("/families/:familyId", zValidator("param", familyIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId } = c.req.valid("param");
  const family = await getFamily(familyId);
  const membership = await familyService.getMembership(familyId, account.id);
  if (!membership) throw Errors.FORBIDDEN();
  return c.json({ family, membership });
});

app.patch(
  "/families/:familyId",
  zValidator("param", familyIdParam),
  zValidator("json", familyUpdateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const body = c.req.valid("json");
    const family = await familyService.updateFamily(account, familyId, body);
    return c.json({ family });
  },
);

app.delete("/families/:familyId", zValidator("param", familyIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId } = c.req.valid("param");
  const body = await c.req.json().catch(() => ({}));
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  await familyService.deleteFamily(account, familyId, confirmation);
  return c.json({ deleted: true });
});

// Memberships
app.get("/families/:familyId/members", zValidator("param", familyIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId } = c.req.valid("param");
  const membership = await familyService.getMembership(familyId, account.id);
  if (!membership) throw Errors.FORBIDDEN();
  const members = await familyService.listMembers(familyId);
  return c.json({ members });
});

app.patch(
  "/families/:familyId/members/:membershipId",
  zValidator("param", z.object({ familyId: uuidSchema, membershipId: uuidSchema })),
  zValidator("json", membershipUpdateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, membershipId } = c.req.valid("param");
    const body = c.req.valid("json");
    const membership = await familyService.updateMembership(
      account,
      familyId,
      membershipId,
      body.role,
    );
    return c.json({ membership });
  },
);

app.put(
  "/families/:familyId/members/:membershipId/person",
  zValidator("param", z.object({ familyId: uuidSchema, membershipId: uuidSchema })),
  zValidator("json", membershipPersonSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, membershipId } = c.req.valid("param");
    const { personId } = c.req.valid("json");
    const membership = await familyService.linkMemberPerson(
      account,
      familyId,
      membershipId,
      personId,
    );
    return c.json({ membership });
  },
);

app.delete(
  "/families/:familyId/members/:membershipId",
  zValidator("param", z.object({ familyId: uuidSchema, membershipId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, membershipId } = c.req.valid("param");
    await familyService.removeMembership(account, familyId, membershipId);
    return c.json({ removed: true });
  },
);

app.post(
  "/families/:familyId/transfer-ownership",
  zValidator("param", familyIdParam),
  zValidator("json", ownershipTransferSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const body = c.req.valid("json");
    await familyService.transferOwnership(account, familyId, body.newCreatorMembershipId);
    return c.json({ transferred: true });
  },
);

// Invitations
app.post(
  "/families/:familyId/invitations",
  zValidator("param", familyIdParam),
  zValidator("json", invitationCreateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await familyService.createInvitation(account, familyId, body);
    return c.json({ invitation: result.invitation, token: result.token }, 201);
  },
);

app.post(
  "/invitations/:token/accept",
  zValidator("param", z.object({ token: z.string().min(1) })),
  async (c) => {
    const account = requireAccount(c);
    const { token } = c.req.valid("param");
    const result = await familyService.acceptInvitation(account, token);
    return c.json({ membership: result.membership, alreadyMember: result.alreadyMember });
  },
);

// People
app.post(
  "/families/:familyId/people",
  zValidator("param", familyIdParam),
  zValidator("json", personCreateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const body = c.req.valid("json");
    const person = await peopleService.createPerson(account, familyId, body);
    return c.json({ person }, 201);
  },
);

app.get("/families/:familyId/people", zValidator("param", familyIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId } = c.req.valid("param");
  const search = c.req.query("search");
  const people = await peopleService.listPeopleFor(account, familyId, search);
  return c.json({ people });
});

app.get("/families/:familyId/people/:personId", zValidator("param", personIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId, personId } = c.req.valid("param");
  const person = await peopleService.getPersonFor(account, familyId, personId);
  return c.json({ person });
});

app.patch(
  "/families/:familyId/people/:personId",
  zValidator("param", personIdParam),
  zValidator("json", personUpdateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, personId } = c.req.valid("param");
    const body = c.req.valid("json");
    const person = await peopleService.updatePerson(account, familyId, personId, body);
    return c.json({ person });
  },
);

app.delete(
  "/families/:familyId/people/:personId",
  zValidator("param", personIdParam),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, personId } = c.req.valid("param");
    await peopleService.deletePerson(account, familyId, personId);
    return c.json({ deleted: true });
  },
);

// Tree
const treeQuery = z.object({
  rootPersonId: uuidSchema.optional(),
  direction: z.enum(["ancestors", "descendants", "both"]).default("both"),
  depth: z.coerce.number().int().min(1).max(100).default(100),
});

app.get(
  "/families/:familyId/tree",
  zValidator("param", familyIdParam),
  zValidator("query", treeQuery),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const ctx = await loadViewerContext(account.id, familyId);
    const { rootPersonId, direction, depth } = c.req.valid("query");
    const tree = await treeService.getTree(familyId, rootPersonId, direction, depth);
    return c.json({ ...tree, people: tree.people.map((p) => presentPerson(p, ctx)) });
  },
);

app.post(
  "/families/:familyId/relationships/parent-child",
  zValidator("param", familyIdParam),
  zValidator("json", parentChildEdgeSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const body = c.req.valid("json");
    const edge = await treeService.addParentChildEdge(
      account,
      familyId,
      body.parentPersonId,
      body.childPersonId,
    );
    return c.json({ edge }, 201);
  },
);

app.delete(
  "/families/:familyId/relationships/parent-child/:relationshipId",
  zValidator("param", relationshipIdParam),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, relationshipId } = c.req.valid("param");
    await treeService.removeParentChildEdge(account, familyId, relationshipId);
    return c.json({ removed: true });
  },
);

// Social
app.post(
  "/families/:familyId/posts",
  zValidator("param", familyIdParam),
  zValidator("json", postCreateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const body = c.req.valid("json");
    const post = await socialService.createPost(account, familyId, body);
    return c.json({ post }, 201);
  },
);

app.get(
  "/families/:familyId/posts",
  zValidator("param", familyIdParam),
  zValidator(
    "query",
    z.object({
      cursor: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  ),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const { cursor, limit } = c.req.valid("query");
    const result = await socialService.listPosts(account, familyId, cursor, limit);
    return c.json(result);
  },
);

app.patch(
  "/families/:familyId/posts/:postId",
  zValidator("param", postIdParam),
  zValidator("json", postUpdateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, postId } = c.req.valid("param");
    const body = c.req.valid("json");
    const post = await socialService.updatePost(account, familyId, postId, body);
    return c.json({ post });
  },
);

app.delete("/families/:familyId/posts/:postId", zValidator("param", postIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId, postId } = c.req.valid("param");
  await socialService.deletePost(account, familyId, postId);
  return c.json({ deleted: true });
});

app.post(
  "/families/:familyId/posts/:postId/comments",
  zValidator("param", postIdParam),
  zValidator("json", commentCreateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, postId } = c.req.valid("param");
    const body = c.req.valid("json");
    const comment = await socialService.createComment(account, familyId, postId, body);
    return c.json({ comment }, 201);
  },
);

app.get(
  "/families/:familyId/posts/:postId/comments",
  zValidator("param", postIdParam),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, postId } = c.req.valid("param");
    const comments = await socialService.listComments(account, familyId, postId);
    return c.json({ comments });
  },
);

app.patch(
  "/families/:familyId/comments/:commentId",
  zValidator("param", commentIdParam),
  zValidator("json", commentUpdateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, commentId } = c.req.valid("param");
    const body = c.req.valid("json");
    const comment = await socialService.updateComment(account, familyId, commentId, body);
    return c.json({ comment });
  },
);

app.delete(
  "/families/:familyId/comments/:commentId",
  zValidator("param", commentIdParam),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, commentId } = c.req.valid("param");
    await socialService.deleteComment(account, familyId, commentId);
    return c.json({ deleted: true });
  },
);

app.put(
  "/families/:familyId/posts/:postId/reaction",
  zValidator("param", postIdParam),
  zValidator("json", reactionSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, postId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await socialService.setReaction(account, familyId, postId, body.type);
    return c.json(result);
  },
);

app.delete(
  "/families/:familyId/posts/:postId/reaction",
  zValidator("param", postIdParam),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, postId } = c.req.valid("param");
    await socialService.removeReaction(account, familyId, postId);
    return c.json({ removed: true });
  },
);

// Help board
app.get(
  "/families/:familyId/help",
  zValidator("param", familyIdParam),
  zValidator(
    "query",
    z.object({ status: helpStatusSchema.optional(), kind: helpKindSchema.optional() }),
  ),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const items = await helpService.listHelpRequests(account, familyId, c.req.valid("query"));
    return c.json({ items });
  },
);

app.post(
  "/families/:familyId/help",
  zValidator("param", familyIdParam),
  zValidator("json", helpCreateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId } = c.req.valid("param");
    const item = await helpService.createHelpRequest(account, familyId, c.req.valid("json"));
    return c.json({ item }, 201);
  },
);

app.patch(
  "/families/:familyId/help/:helpId",
  zValidator("param", helpIdParam),
  zValidator("json", helpUpdateSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, helpId } = c.req.valid("param");
    const item = await helpService.updateHelpRequest(
      account,
      familyId,
      helpId,
      c.req.valid("json"),
    );
    return c.json({ item });
  },
);

app.delete("/families/:familyId/help/:helpId", zValidator("param", helpIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId, helpId } = c.req.valid("param");
  return c.json(await helpService.deleteHelpRequest(account, familyId, helpId));
});

app.post(
  "/families/:familyId/help/:helpId/responses",
  zValidator("param", helpIdParam),
  zValidator("json", helpResponseSchema),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, helpId } = c.req.valid("param");
    const response = await helpService.respondToHelpRequest(
      account,
      familyId,
      helpId,
      c.req.valid("json").body,
    );
    return c.json({ response }, 201);
  },
);

app.delete(
  "/families/:familyId/help/:helpId/responses/:responseId",
  zValidator("param", helpIdParam.extend({ responseId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { familyId, helpId, responseId } = c.req.valid("param");
    return c.json(await helpService.deleteHelpResponse(account, familyId, helpId, responseId));
  },
);

// DNA matches (beta)
app.get("/dna/matches", async (c) => {
  const account = requireAccount(c);
  const matches = await dnaService.listMatches(account);
  return c.json({ matches });
});

app.post("/dna/matches", zValidator("json", dnaMatchCreateSchema), async (c) => {
  const account = requireAccount(c);
  const match = await dnaService.reportMatch(account, c.req.valid("json"));
  return c.json({ match }, 201);
});

app.post(
  "/dna/matches/:matchId/confirm",
  zValidator("param", z.object({ matchId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    return c.json(await dnaService.confirmMatch(account, c.req.valid("param").matchId));
  },
);

app.delete(
  "/dna/matches/:matchId",
  zValidator("param", z.object({ matchId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    return c.json(await dnaService.deleteMatch(account, c.req.valid("param").matchId));
  },
);

// Friends
app.post("/friends/requests", zValidator("json", friendRequestSchema), async (c) => {
  const account = requireAccount(c);
  const body = c.req.valid("json");
  const result = await friendsService.sendFriendRequest(account, body.accountId);
  return c.json(result, 201);
});

app.get("/friends/requests", async (c) => {
  const account = requireAccount(c);
  const requests = await friendsService.listFriendRequests(account);
  return c.json({ requests });
});

app.post(
  "/friends/requests/:requestId/accept",
  zValidator("param", z.object({ requestId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { requestId } = c.req.valid("param");
    const result = await friendsService.acceptFriendRequest(account, requestId);
    return c.json(result);
  },
);

app.post(
  "/friends/requests/:requestId/reject",
  zValidator("param", z.object({ requestId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { requestId } = c.req.valid("param");
    const result = await friendsService.rejectFriendRequest(account, requestId);
    return c.json(result);
  },
);

app.post(
  "/friends/requests/:requestId/cancel",
  zValidator("param", z.object({ requestId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { requestId } = c.req.valid("param");
    const result = await friendsService.cancelFriendRequest(account, requestId);
    return c.json(result);
  },
);

app.get("/friends", async (c) => {
  const account = requireAccount(c);
  const friends = await friendsService.listFriends(account);
  return c.json({ friends });
});

app.delete(
  "/friends/:accountId",
  zValidator("param", z.object({ accountId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { accountId } = c.req.valid("param");
    await friendsService.unfriend(account, accountId);
    return c.json({ unfriended: true });
  },
);

// Media
app.post("/media/upload-intents", zValidator("json", uploadIntentSchema), async (c) => {
  const account = requireAccount(c);
  const body = c.req.valid("json");
  const result = await mediaService.createUploadIntent(account, body);
  return c.json(result, 201);
});

app.post(
  "/media/:mediaId/complete",
  zValidator("param", z.object({ mediaId: uuidSchema })),
  zValidator("json", uploadCompleteSchema),
  async (c) => {
    const account = requireAccount(c);
    const { mediaId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await mediaService.completeUpload(account, mediaId, body.sha256);
    return c.json(result);
  },
);

app.put(
  "/media/:mediaId/content",
  zValidator("param", z.object({ mediaId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { mediaId } = c.req.valid("param");
    const declared = Number(c.req.header("content-length") ?? "0");
    if (declared > mediaService.MAX_MEDIA_SIZE) {
      throw Errors.MEDIA_INVALID("File exceeds maximum size.");
    }
    const data = new Uint8Array(await c.req.arrayBuffer());
    const result = await mediaService.uploadContent(account, mediaId, data);
    return c.json(result);
  },
);

app.get(
  "/media/:mediaId/content",
  zValidator("param", z.object({ mediaId: uuidSchema })),
  async (c) => {
    const account = requireAccount(c);
    const { mediaId } = c.req.valid("param");
    const { mimeType, sha256, object } = await mediaService.getContent(account, mediaId);
    const etag = sha256 ? `"${sha256}"` : undefined;
    if (etag && c.req.header("if-none-match") === etag) {
      return c.body(null, 304);
    }
    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": String(object.size),
      // Private family data: never stored by shared caches.
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    };
    if (etag) headers.ETag = etag;
    return c.body(object.body, 200, headers);
  },
);

// Export
app.get("/families/:familyId/export", zValidator("param", familyIdParam), async (c) => {
  const account = requireAccount(c);
  const { familyId } = c.req.valid("param");
  const format = c.req.query("format") as "json" | "csv" | undefined;
  if (format !== "json" && format !== "csv") {
    throw Errors.VALIDATION("format must be json or csv.");
  }
  const result = await exportService.exportFamilyData(account, familyId, { format });
  return c.newResponse(result.data, 200, {
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename="${result.filename}"`,
  });
});
