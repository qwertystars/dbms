import { AudienceBadge } from "~/client/components/kinship";
import { useState, type SubmitEvent } from "react";
import { api, errorMessage } from "~/client/api";
import { Avatar, Icon, Loading, timeAgo, useBusy } from "~/client/components/ui";

const REACTIONS = [
  { type: "LIKE", emoji: "👍", label: "Like" },
  { type: "LOVE", emoji: "❤️", label: "Love" },
  { type: "LAUGH", emoji: "😂", label: "Laugh" },
  { type: "SAD", emoji: "😢", label: "Sad" },
] as const;

type ReactionType = (typeof REACTIONS)[number]["type"];

export interface FeedPost {
  id: string;
  authorAccountId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; displayName: string };
  reactionCounts?: Record<string, number>;
  commentCount?: number;
  myReaction?: string | null;
  audience?: "FAMILY" | "CLOSE";
}

export interface FeedComment {
  id: string;
  authorAccountId: string;
  body: string;
  createdAt: string;
  author?: { id: string; displayName: string };
}

interface PostCardProps {
  familyId: string;
  post: FeedPost;
  me: { id: string; displayName?: string } | null;
  role: string;
  onPatch: (postId: string, patch: Partial<FeedPost>) => void;
  onRemove: (postId: string) => void;
  onError: (message: string | null) => void;
}

export function PostCard({ familyId, post, me, role, onPatch, onRemove, onError }: PostCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [savingEdit, runSaveEdit] = useBusy();
  const [sendingComment, runComment] = useBusy();

  const authorName = post.author?.displayName ?? "Former member";
  const counts = post.reactionCounts ?? {};
  const created = new Date(post.createdAt);
  const edited = new Date(post.updatedAt).getTime() - created.getTime() > 1000;
  const canEdit = me?.id === post.authorAccountId;
  const canDelete = canEdit || role === "CREATOR";

  async function react(type: ReactionType) {
    const previous = post.myReaction ?? null;
    const next = previous === type ? null : type;
    const nextCounts = { ...counts };
    if (previous) nextCounts[previous] = Math.max(0, (nextCounts[previous] ?? 0) - 1);
    if (next) nextCounts[next] = (nextCounts[next] ?? 0) + 1;
    onPatch(post.id, { myReaction: next, reactionCounts: nextCounts });

    const res = next
      ? await api("PUT", `/api/v1/families/${familyId}/posts/${post.id}/reaction`, { type: next })
      : await api("DELETE", `/api/v1/families/${familyId}/posts/${post.id}/reaction`);
    if (res.status !== 200) {
      onPatch(post.id, { myReaction: previous, reactionCounts: counts });
      onError(errorMessage(res, "Could not save your reaction."));
    }
  }

  async function loadComments() {
    const res = await api("GET", `/api/v1/families/${familyId}/posts/${post.id}/comments`);
    if (res.status === 200) setComments(res.body.comments || []);
    else onError(errorMessage(res, "Could not load comments."));
  }

  function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) void loadComments();
  }

  async function addComment(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const body = ((new FormData(formEl).get("body") as string) || "").trim();
    if (!body) return;
    const res = await runComment(() =>
      api("POST", `/api/v1/families/${familyId}/posts/${post.id}/comments`, { body }),
    );
    if (!res || res.status !== 201) {
      onError(res ? errorMessage(res, "Could not add your comment.") : null);
      return;
    }
    const comment: FeedComment = {
      ...res.body.comment,
      author: me ? { id: me.id, displayName: me.displayName ?? "You" } : undefined,
    };
    setComments((prev) => [...(prev ?? []), comment]);
    onPatch(post.id, { commentCount: (post.commentCount ?? 0) + 1 });
    onError(null);
    formEl.reset();
  }

  async function deleteComment(comment: FeedComment) {
    if (!window.confirm("Delete this comment?")) return;
    const res = await api("DELETE", `/api/v1/families/${familyId}/comments/${comment.id}`);
    if (res.status !== 200) {
      onError(errorMessage(res, "Could not delete the comment."));
      return;
    }
    setComments((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
    onPatch(post.id, { commentCount: Math.max(0, (post.commentCount ?? 0) - 1) });
    onError(null);
  }

  async function saveEdit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || body === post.body) {
      setEditing(false);
      return;
    }
    const res = await runSaveEdit(() =>
      api("PATCH", `/api/v1/families/${familyId}/posts/${post.id}`, { body }),
    );
    if (!res || res.status !== 200) {
      onError(res ? errorMessage(res, "Could not save your changes.") : null);
      return;
    }
    onPatch(post.id, { body, updatedAt: new Date().toISOString() });
    setEditing(false);
    onError(null);
  }

  async function removePost() {
    if (!window.confirm("Delete this post? Comments will be hidden with it.")) return;
    const res = await api("DELETE", `/api/v1/families/${familyId}/posts/${post.id}`);
    if (res.status !== 200) {
      onError(errorMessage(res, "Could not delete the post."));
      return;
    }
    onRemove(post.id);
  }

  return (
    <article className="card post">
      <div className="post-inner">
        <Avatar name={authorName} />
        <div className="post-main">
          <header className="post-head">
            <div className="post-meta">
              <span className="post-author">{authorName}</span>
              <span className="post-dot">·</span>
              <time dateTime={created.toISOString()} title={created.toLocaleString()}>
                {timeAgo(created)}
              </time>
              {edited && <span className="post-dot">· edited</span>}
              <AudienceBadge audience={post.audience} />
            </div>
            {(canEdit || canDelete) && !editing && (
              <div className="post-actions">
                {canEdit && (
                  <button
                    type="button"
                    className="post-action"
                    onClick={() => {
                      setDraft(post.body);
                      setEditing(true);
                    }}
                    aria-label="Edit post"
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="post-action post-action-danger"
                    onClick={() => void removePost()}
                    aria-label="Delete post"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            )}
          </header>

          {editing ? (
            <form onSubmit={saveEdit} className="post-edit">
              <label>
                <span className="visually-hidden">Edit post</span>
                <textarea
                  className="textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={5000}
                  required
                />
              </label>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={savingEdit}>
                  {savingEdit ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <p className="post-body">{post.body}</p>
          )}

          <footer className="post-footer">
            <div className="reactions" role="group" aria-label="React to this post">
              {REACTIONS.map((reaction) => {
                const count = counts[reaction.type] ?? 0;
                const active = post.myReaction === reaction.type;
                return (
                  <button
                    key={reaction.type}
                    type="button"
                    className={`reaction${active ? " active" : ""}`}
                    aria-pressed={active}
                    aria-label={`${reaction.label}${count ? ` (${count})` : ""}`}
                    title={reaction.label}
                    onClick={() => void react(reaction.type)}
                  >
                    <span className="reaction-emoji" aria-hidden="true">
                      {reaction.emoji}
                    </span>
                    {count > 0 && <span className="reaction-count">{count}</span>}
                  </button>
                );
              })}
            </div>
            <button type="button" className="post-action" onClick={toggleComments}>
              <Icon name="message" size={16} />
              <span>{post.commentCount ? `${post.commentCount} ` : ""}Comment</span>
            </button>
          </footer>

          {showComments && (
            <section className="comments" aria-label="Comments">
              {comments === null ? (
                <Loading label="Loading comments…" />
              ) : comments.length === 0 ? (
                <p className="subtle">No comments yet. Start the conversation.</p>
              ) : (
                <ul className="comment-list">
                  {comments.map((comment) => (
                    <li key={comment.id} className="comment">
                      <Avatar name={comment.author?.displayName} size="sm" />
                      <div className="comment-bubble">
                        <div className="comment-head">
                          <span className="comment-author">
                            {comment.author?.displayName ?? "Former member"}
                          </span>
                          <time className="subtle" dateTime={comment.createdAt}>
                            {timeAgo(comment.createdAt)}
                          </time>
                          {(me?.id === comment.authorAccountId || role === "CREATOR") && (
                            <button
                              type="button"
                              className="comment-delete"
                              onClick={() => void deleteComment(comment)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <p className="comment-body">{comment.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addComment} className="comment-form">
                <label style={{ flex: 1 }}>
                  <span className="visually-hidden">Add a comment</span>
                  <input
                    className="input"
                    name="body"
                    placeholder="Write a comment…"
                    maxLength={2000}
                    required
                  />
                </label>
                <button type="submit" className="btn btn-primary" disabled={sendingComment}>
                  {sendingComment ? "Sending…" : "Send"}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
