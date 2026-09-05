import { createPost } from "./actions";

export function CreatePostForm({ familyId }: { familyId: string; accountId: string }) {
  const action = createPost.bind(null, familyId);
  return (
    <form action={action}>
      <textarea name="body" placeholder="Write a post..." required />
      <button type="submit">Post</button>
    </form>
  );
}
