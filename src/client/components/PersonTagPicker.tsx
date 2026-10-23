import { useState } from "react";
import { Avatar } from "~/client/components/ui";
import type { PersonSummary } from "~/client/family-data";

export function PersonTagPicker({
  people,
  selected,
  onChange,
}: {
  people: PersonSummary[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const chosen = people.filter((p) => selected.includes(p.id));
  const matches =
    needle && selected.length < 20
      ? people
          .filter((p) => !selected.includes(p.id) && p.name.toLocaleLowerCase().includes(needle))
          .slice(0, 6)
      : [];

  return (
    <div className="tag-picker">
      {chosen.length > 0 && (
        <ul className="chip-row" aria-label="Tagged people">
          {chosen.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="chip active"
                onClick={() => onChange(selected.filter((id) => id !== p.id))}
                aria-label={`Remove ${p.name}`}
              >
                {p.name} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="tag-picker-search">
        <span className="visually-hidden">Tag a relative</span>
        <input
          className="input"
          type="search"
          placeholder={
            selected.length >= 20 ? "20 people tagged (maximum)" : "Tag relatives in this memory…"
          }
          disabled={selected.length >= 20}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {matches.length > 0 && (
        <ul className="tag-picker-results" role="listbox" aria-label="Matching people">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onChange([...selected, p.id]);
                  setQuery("");
                }}
              >
                <Avatar name={p.name} size="sm" mediaId={p.profileMediaId} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
