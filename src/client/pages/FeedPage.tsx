import { useEffect, useState, type SubmitEvent } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { FamilyHeader } from "~/client/components/FamilyNav";
import { PostCard, type FeedPost } from "~/client/components/PostCard";
import { PersonTagPicker } from "~/client/components/PersonTagPicker";
import type { PersonSummary } from "~/client/family-data";
import { Alert, Avatar, EmptyState, ErrorState, Loading, useBusy } from "~/client/components/ui";

interface FeedData {
  family: any;
  role: string;
  people: PersonSummary[];
  posts: FeedPost[];
  nextCursor?: string;
}

export function FeedPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { me } = useAuth();
  const [data, setData] = useState<FeedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, runPost] = useBusy();
  const [loadingMore, runMore] = useBusy();
  const [tagged, setTagged] = useState<string[]>([]);

  async function load() {
    const family = await api("GET", `/api/v1/families/${familyId}`);
    if (family.status !== 200) {
      setError(errorMessage(family, "Family not found."));
      return;
    }
    const [feed, people] = await Promise.all([
      api("GET", `/api/v1/families/${familyId}/posts`),
      api("GET", `/api/v1/families/${familyId}/tree`),
    ]);
    setData({
      family: family.body.family,
      role: family.body.membership.role,
      people: people.body.people || [],
      posts: feed.body.posts || [],
      nextCursor: feed.body.nextCursor,
    });
  }

  useEffect(() => {
    setData(null);
    setError(null);
    setTagged([]);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  async function createPost(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const body = ((new FormData(formEl).get("body") as string) || "").trim();
    if (!body) return;
    const res = await runPost(() =>
      api("POST", `/api/v1/families/${familyId}/posts`, { body, personIds: tagged }),
    );
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not publish post.") : null);
      return;
    }
    formEl.reset();
    setTagged([]);
    setError(null);
    await load();
  }

  async function loadMore() {
    if (!data?.nextCursor) return;
    const res = await runMore(() =>
      api(
        "GET",
        `/api/v1/families/${familyId}/posts?cursor=${encodeURIComponent(data.nextCursor!)}`,
      ),
    );
    if (!res || res.status !== 200) {
      setError(res ? errorMessage(res, "Could not load older posts.") : null);
      return;
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: [...prev.posts, ...(res.body.posts || [])],
            nextCursor: res.body.nextCursor,
          }
        : prev,
    );
  }

  function patchPost(postId: string, patch: Partial<FeedPost>) {
    setData((prev) =>
      prev
        ? { ...prev, posts: prev.posts.map((p) => (p.id === postId ? { ...p, ...patch } : p)) }
        : prev,
    );
  }

  function removePost(postId: string) {
    setData((prev) =>
      prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== postId) } : prev,
    );
  }

  if (error && !data) return <ErrorState title="Could not open this family" message={error} />;
  if (!data) return <Loading />;

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={data.family}
        role={data.role}
        title="Memories"
        description="Stories, updates and moments shared with this family only."
      />

      <div className="feed">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

        <form onSubmit={createPost} className="card card-body composer">
          <div className="composer-row">
            <Avatar name={me?.displayName} />
            <label className="composer-field">
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
          {data.people.length > 0 && (
            <PersonTagPicker people={data.people} selected={tagged} onChange={setTagged} />
          )}
          <div className="composer-footer">
            <span className="subtle">Visible to {data.family.name} only.</span>
            <button type="submit" className="btn btn-primary" disabled={posting}>
              {posting ? "Posting…" : "Share"}
            </button>
          </div>
        </form>

        {data.posts.length === 0 ? (
          <div className="card">
            <EmptyState title="No memories yet">
              Be the first to share a story, a photo or a small update.
            </EmptyState>
          </div>
        ) : (
          data.posts.map((post) => (
            <PostCard
              key={post.id}
              familyId={familyId!}
              post={post}
              me={me}
              role={data.role}
              onPatch={patchPost}
              onRemove={removePost}
              onError={setError}
            />
          ))
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
