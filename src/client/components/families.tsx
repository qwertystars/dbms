import { type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { Field, Icon, RoleBadge, useBusy } from "~/client/components/ui";

export function FamilyCard({ item }: { item: any }) {
  const { family, membership } = item;
  return (
    <Link to={`/app/families/${family.id}`} className="card card-body card-link">
      <div className="family-card">
        <div className="family-card-art" aria-hidden="true">
          <Icon name="tree" size={42} />
          <span>Every branch has roots.</span>
        </div>
        <div className="family-card-top">
          <h3>{family.name}</h3>
          <RoleBadge role={membership.role} />
        </div>
        <p>{family.description || "A private place for your family’s story."}</p>
        <div className="family-card-footer">
          <span>Open family space</span>
          <span aria-hidden="true">↗</span>
        </div>
      </div>
    </Link>
  );
}

export function CreateFamilyForm({ onError }: { onError: (message: string) => void }) {
  const navigate = useNavigate();
  const [busy, run] = useBusy();

  async function createFamily(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = ((form.get("name") as string) || "").trim();
    const description = ((form.get("description") as string) || "").trim();
    if (!name) {
      onError("Family name is required.");
      return;
    }
    const res = await run(() =>
      api("POST", "/api/v1/families", { name, ...(description ? { description } : {}) }),
    );
    if (!res || res.status !== 201) {
      onError(res ? errorMessage(res, "Could not create family.") : "Could not create family.");
      return;
    }
    navigate(`/app/families/${res.body.family.id}`);
  }

  return (
    <form onSubmit={createFamily} className="form">
      <Field label="Family name">
        <input className="input" name="name" placeholder="The Smiths" required maxLength={255} />
      </Field>
      <Field label="Description" optional>
        <textarea
          className="textarea"
          name="description"
          placeholder="Who is this family space for?"
          maxLength={1000}
          rows={3}
        />
      </Field>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Creating…" : "Create family"}
      </button>
    </form>
  );
}
