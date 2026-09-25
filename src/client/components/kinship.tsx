import { capitalize } from "~/client/components/ui";

export interface KinshipInfo {
  label: string | null;
  degree: number | null;
  byMarriage: boolean;
  circle: "SELF" | "CLOSE" | "FAR" | "UNKNOWN";
}

export const CIRCLE_LABELS: Record<KinshipInfo["circle"], string> = {
  SELF: "You",
  CLOSE: "Close family",
  FAR: "Extended family",
  UNKNOWN: "Not connected to you",
};

/** "Your aunt" plus a close-family marker; nothing when the viewer isn't placed in the tree. */
export function KinshipTag({ kinship }: { kinship?: KinshipInfo | null }) {
  if (!kinship || kinship.circle === "UNKNOWN" || !kinship.label) return null;
  if (kinship.circle === "SELF") return <span className="badge badge-self">You</span>;
  return (
    <span
      className={`badge ${kinship.circle === "CLOSE" ? "badge-close" : ""}`}
      title={`${CIRCLE_LABELS[kinship.circle]} · degree ${kinship.degree}`}
    >
      {capitalize(kinship.label)}
    </span>
  );
}

export function AudienceBadge({ audience }: { audience?: string }) {
  if (audience !== "CLOSE") return null;
  return (
    <span className="badge badge-close" title="Shared with close family only">
      Close family
    </span>
  );
}

export const VISIBILITY_OPTIONS = [
  { value: "FAMILY", label: "Everyone in the family" },
  { value: "CLOSE", label: "Close family only" },
  { value: "MAINTAINERS", label: "Only me and the family's editors" },
] as const;

export const FIELD_GROUPS: { key: string; label: string; fields: string }[] = [
  { key: "work", label: "Work & skills", fields: "Occupation, education, city, can help with" },
  { key: "biography", label: "Biography", fields: "About them" },
  { key: "birthday", label: "Birthday", fields: "Full date of birth (the year always shows)" },
  { key: "contact", label: "Contact", fields: "Email and phone" },
  { key: "address", label: "Address", fields: "Home address" },
  { key: "body", label: "Height & weight", fields: "Height and weight" },
];

export const HELP_CATEGORIES: Record<string, string> = {
  ADVICE: "Advice",
  CAREER: "Career & jobs",
  EDUCATION: "Studies",
  HEALTH: "Health",
  HOUSING: "Housing & moving",
  TRAVEL: "Travel & visits",
  CARE: "Childcare & eldercare",
  OTHER: "Other",
};
