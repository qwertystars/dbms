import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { PageHeader, RoleBadge } from "~/client/components/ui";

export const FAMILY_SECTIONS = [
  { path: "", label: "Overview", icon: "home" },
  { path: "/tree", label: "Tree", icon: "tree" },
  { path: "/memories", label: "Memories", icon: "message" },
  { path: "/people", label: "People", icon: "users" },
  { path: "/events", label: "Events", icon: "calendar" },
] as const;

/** Shared header for every family-scoped page: name, role, and section tabs. */
export function FamilyHeader({
  familyId,
  family,
  role,
  title,
  description,
  actions,
}: {
  familyId: string;
  family: { name: string; description?: string | null };
  role: string;
  /** Overrides the page title; defaults to the family name. */
  title?: string;
  description?: string | null;
  /** Extra buttons rendered next to the role badge. */
  actions?: ReactNode;
}) {
  return (
    <>
      <PageHeader
        eyebrow={title ? family.name : "Family"}
        title={title ?? family.name}
        description={description === undefined ? family.description : description}
        actions={
          <>
            <RoleBadge role={role} />
            {actions}
          </>
        }
      />
      <nav className="tabs" aria-label="Family sections">
        {FAMILY_SECTIONS.map((section) => (
          <NavLink
            key={section.label}
            to={`/app/families/${familyId}${section.path}`}
            end={section.path === ""}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
