import { useCallback, useRef, useState, type ReactNode } from "react";
import { mediaUrl } from "~/client/api";

// Small, dependency-free UI building blocks shared by every page.
// Styling lives in src/client/styles.css.

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Alert({
  kind = "error",
  children,
  onClose,
}: {
  kind?: "error" | "success" | "info";
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <div>{children}</div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Full-page error used when a route's primary data cannot be loaded. */
export function ErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  /** Optional recovery control, e.g. a retry button. */
  action?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="empty">
        <p className="empty-title">{title}</p>
        <p>{message}</p>
        {action && <div className="empty-action">{action}</div>}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Render children without padding, e.g. for edge-to-edge lists. */
  flush?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  );
}

export function Field({
  label,
  optional,
  hint,
  className,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field-label">
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const ROLE_LABELS: Record<string, string> = {
  CREATOR: "Creator",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export function RoleBadge({ role }: { role: string }) {
  return <span className={`badge badge-${role.toLowerCase()}`}>{ROLE_LABELS[role] ?? role}</span>;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** Stable neutral background (0-4) for initials, derived from the name only. */
function toneFor(name: string | null | undefined): number {
  let hash = 0;
  for (const char of name ?? "") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 5;
}

export function Avatar({
  name,
  size = "md",
  mediaId,
  deceased = false,
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  mediaId?: string | null;
  deceased?: boolean;
}) {
  const classes = ["avatar", `avatar-tone-${toneFor(name)}`];
  if (size !== "md") classes.push(`avatar-${size}`);
  // Someone who has died gets a pencil ring and nothing more (brand spec §3.7).
  if (deceased) classes.push("avatar-deceased");
  return (
    <span className={classes.join(" ")} aria-hidden="true">
      {mediaId ? <img src={mediaUrl(mediaId)} alt="" loading="lazy" /> : initials(name)}
    </span>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // The Clipboard API needs a secure context; fall back to a selection copy.
      inputRef.current?.select();
      ok = document.execCommand?.("copy") ?? false;
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      inputRef.current?.select();
    }
  }
  return (
    <div className="copy-box">
      <input
        ref={inputRef}
        className="input"
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Tracks an in-flight async action so buttons can show a pending state. */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

/** Formats an ISO date (YYYY-MM-DD) without timezone shifts. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function lifeSpan(person: { dateOfBirth?: string | null; dateOfDeath?: string | null }) {
  const born = person.dateOfBirth?.slice(0, 4);
  const died = person.dateOfDeath?.slice(0, 4);
  if (born && died) return `${born} – ${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return "";
}

export function timeAgo(value: string | number | Date): string {
  const date = new Date(value);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "Today", "Tomorrow", "In 3 days", "In 2 weeks" for a day offset. */
export function relativeDay(daysUntil: number): string {
  if (daysUntil <= 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil < 7) return `In ${daysUntil} days`;
  if (daysUntil < 14) return "In 1 week";
  if (daysUntil < 60) return `In ${Math.round(daysUntil / 7)} weeks`;
  return `In ${Math.round(daysUntil / 30)} months`;
}

/** Short "7 Sep" label for an ISO date string without timezone shifts. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function capitalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Minimal inline icons (stroke-based, inherit currentColor).
const iconPaths: Record<string, ReactNode> = {
  tree: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M12 7.5V12M12 12H6v4.5M12 12h6v4.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2c2.1.7 3.5 2.8 3.5 5.8" />
    </>
  ),
  message: <path d="M4 5h16v11H9l-5 4z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  cake: (
    <>
      <path d="M4.5 12.5h15V20h-15z" />
      <path d="M4.5 16c1.6 1.1 2.7 1.1 4.3 0s2.6-1.1 4.2 0 2.7 1.1 4.3 0" />
      <path d="M12 12.5V8.5" />
      <circle cx="12" cy="6.2" r="1.3" />
    </>
  ),
  // Remembrance: a plain pencil ring, never a religious symbol (brand spec §3.7).
  ring: <circle cx="12" cy="12" r="6.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" />
    </>
  ),
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V20H4z" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20M10.5 7.5v6M7.5 10.5h6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20M7.5 10.5h6" />
    </>
  ),
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4h4" />
    </>
  ),
  link: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 12c4 0 5-6 7-6M8.5 12c4 0 5 6 7 6" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof iconPaths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}
