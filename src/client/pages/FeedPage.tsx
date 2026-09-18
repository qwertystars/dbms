import { useEffect, useState, type SubmitEvent } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { FamilyHeader } from "~/client/components/FamilyNav";
import {
  Alert,
  Avatar,
  EmptyState,
  ErrorState,
  Loading,
  timeAgo,
  useBusy,
} from "~/client/components/ui";

export function FeedPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { me } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, runPost] = useBusy();
  const [loadingMore, runMore] = useBusy();

  async function load() {
    const family = await api("GET", `/api/v1/families/${familyId}`);
    if (family.status !== 200) {
      setError(errorMessage(family, "Family not found."));
      return;
    }
    const [feed, members] = await Promise.all([
      api("GET", `/api/v1/families/${familyId}/posts`),
      api("GET", `/api/v1/families/${familyId}/members`),
    ]);
    const names = new Map<string, string>(
      (members.body.members || []).map((m: any) => [m.accountId, m.account?.displayName]),
    );
    setData({
      family: family.body.family,
      role: family.body.membership.role,
      posts: feed.body.posts || [],
      nextCursor: feed.body.nextCursor,
      names,
    });
  }

  useEffect(() => {
    setData(null);
    setError(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  async function createPost(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const body = ((new FormData(formEl).get("body") as string) || "").trim();
    if (!body) return;
    const res = await runPost(() => api("POST", `/api/v1/families/${familyId}/posts`, { body }));
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not publish post.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    await load();
  }

  async function loadMore() {
    if (!data?.nextCursor) return;
    const res = await runMore(() =>
      api(
        "GET",
        `/api/v1/families/${familyId}/posts?cursor=${encodeURIComponent(data.nextCursor)}`,
      ),
    );
    if (!res || res.status !== 200) {
      setError(res ? errorMessage(res, "Could not load older posts.") : null);
      return;
    }
    setData((prev: any) => ({
      ...prev,
      posts: [...prev.posts, ...(res.body.posts || [])],
      nextCursor: res.body.nextCursor,
    }));
  }

  if (error && !data) return <ErrorState title="Could not open this family" message={error} />;
  if (!data) return <Loading />;

  const authorName = (id: string) =>
    data.names.get(id) || (id === me?.id ? me?.displayName : null) || "Former member";

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={data.family}
        role={data.role}
        title="Feed"
        description="Updates shared with everyone in this family."
      />

      <div className="stack" style={{ maxWidth: 680 }}>
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

        <form onSubmit={createPost} className="card card-body composer">
          <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <Avatar name={me?.displayName} />
            <label style={{ flex: 1 }}>
              <span className="visually-hidden">New post</span>
              <textarea
                className="textarea"
                name="body"
                placeholder={`Share something with ${data.family.name}…`}
                required
                maxLength={5000}
              />
            </label>
          </div>
          <div className="composer-footer">
            <button type="submit" className="btn btn-primary" disabled={posting}>
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>

        {data.posts.length === 0 ? (
          <div className="card">
            <EmptyState title="No posts yet">Be the first to share an update.</EmptyState>
          </div>
        ) : (
          data.posts.map((post: any) => {
            const name = authorName(post.authorAccountId);
            const created = new Date(post.createdAt);
            return (
              <article key={post.id} className="card card-body">
                <div className="post-head">
                  <Avatar name={name} />
                  <div>
                    <div className="post-author">{name}</div>
                    <time
                      className="subtle"
                      dateTime={created.toISOString()}
                      title={created.toLocaleString()}
                    >
                      {timeAgo(created)}
                    </time>
                  </div>
                </div>
                <p className="post-body">{post.body}</p>
              </article>
            );
          })
        )}

        {data.nextCursor && (
          <div className="row" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="btn"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load older posts"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
