import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";
import { CreatePostForm } from "./CreatePostForm";

export default async function FeedPage({ params }: { params: { familyId: string } }) {
  const { familyId } = params;
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const family = await serverApi("GET", `/api/v1/families/${familyId}`);
  if (family.status !== 200) return notFound();

  const feed = await serverApi("GET", `/api/v1/families/${familyId}/posts`);
  const role = family.body.membership.role;

  return (
    <div>
      <h1>{family.body.family.name} — Feed</h1>
      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href={`/app/families/${familyId}`}>Overview</Link>
        <Link href={`/app/families/${familyId}/tree`}>Tree</Link>
        <Link href={`/app/families/${familyId}/feed`}>Feed</Link>
      </nav>

      {role !== "VIEWER" && <CreatePostForm familyId={familyId} accountId={me.body.id} />}

      {feed.body.posts?.map((post: any) => (
        <article
          key={post.id}
          style={{ border: "1px solid #ddd", padding: "1rem", margin: "1rem 0" }}
        >
          <p>{post.body}</p>
          <small>
            by {post.authorAccountId} · {new Date(post.createdAt).toLocaleString()}
          </small>
        </article>
      ))}
      {feed.body.posts?.length === 0 && <p>No posts yet.</p>}
    </div>
  );
}
