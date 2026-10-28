import { setReducedMotion } from "./dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TreePage } from "~/client/pages/TreePage";
import { FAMILY_ID, edges, people } from "./fixtures";

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;

let handlers: Handler[] = [];
let calls: { method: string; url: string; body?: unknown }[] = [];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function familyResponse(id = FAMILY_ID, role = "CREATOR", name = "The Archers") {
  return { family: { id, name, description: null }, membership: { role } };
}

function serve(options: { role?: string; tree?: () => { status: number; body: unknown } } = {}) {
  handlers.push((url, init) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url === `/api/v1/families/${FAMILY_ID}`) {
      return { status: 200, body: familyResponse(FAMILY_ID, options.role) };
    }
    if (method === "GET" && url === `/api/v1/families/${FAMILY_ID}/tree`) {
      return options.tree?.() ?? { status: 200, body: { people, edges } };
    }
    return undefined;
  });
}

beforeEach(() => {
  handlers = [];
  calls = [];
  setReducedMotion(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? "GET",
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      for (const handler of handlers) {
        const result = handler(url, init);
        if (result) return json(result.status, result.body);
      }
      return json(404, { error: { code: "NOT_FOUND", message: "Not found." } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function ProfileStub() {
  const { personId } = useParams();
  return <p>Profile page for {personId}</p>;
}

function renderTree(path = `/app/families/${FAMILY_ID}/tree`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/families/:familyId/tree" element={<TreePage />} />
        <Route path="/app/families/:familyId/people/:personId" element={<ProfileStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = (name: string) =>
  document.querySelector<HTMLButtonElement>(`.tree-card[aria-label^="${name}"]`);
const cardFor = async (name: string) => waitFor(() => expect(card(name)).not.toBeNull());
const shownIds = () =>
  [...document.querySelectorAll<HTMLElement>(".tree-card")].map((el) => el.dataset.personId).sort();
const toggle = (label: string) => screen.getByRole("button", { name: label });

async function openTree(path?: string) {
  renderTree(path);
  await cardFor("Ada Archer");
}

describe("family tree page", () => {
  it("opens on the founders with their descendants hidden", async () => {
    serve();
    await openTree();
    expect(shownIds()).toEqual(["ada", "gus", "sam"]);
    expect(screen.getByText(/Showing 3 of 8 people/)).toBeTruthy();
    // People with no relationships are listed outside the graph.
    const unlinked = screen
      .getByRole("heading", { name: "Not yet in the tree" })
      .closest("section")!;
    expect(within(unlinked).getByText("Hal Nobody")).toBeTruthy();
  });

  it("reveals the next generation, then the one after, and collapses a branch", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 2 children of Ada Archer"));
    await cardFor("Ben Archer");
    expect(shownIds()).toEqual(["ada", "ben", "cleo", "gus", "sam"]);

    fireEvent.click(toggle("Show 1 child of Ben Archer"));
    await cardFor("Eli Archer");
    // Eli's other parent appears with him; Fay (Cleo's child) stays hidden.
    expect(shownIds()).toEqual(["ada", "ben", "cleo", "dina", "eli", "gus", "sam"]);

    fireEvent.click(toggle("Hide children of Ada Archer"));
    await waitFor(() => expect(card("Ben Archer")).toBeNull());
    expect(shownIds()).toEqual(["ada", "gus", "sam"]);
    // Expansion never touches relationships on the server.
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("keeps a shared descendant as one card when both lines are open", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 1 child of Gus Moreau"));
    await cardFor("Dina Moreau");
    fireEvent.click(toggle("Show 1 child of Dina Moreau"));
    await cardFor("Eli Archer");
    // Ben arrived as Eli's other parent, so only Cleo is left to reveal.
    fireEvent.click(toggle("Show 1 child of Ada Archer"));
    await cardFor("Cleo Archer");
    expect(document.querySelectorAll('[data-person-id="eli"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-person-id="ben"]')).toHaveLength(1);
  });

  it("gives childless people no expansion control", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 2 children of Ada Archer"));
    await cardFor("Cleo Archer");
    fireEvent.click(toggle("Show 1 child of Cleo Archer"));
    await cardFor("Fay Archer");
    const fay = card("Fay Archer")!.closest(".tree-node")!;
    expect(fay.querySelector(".tree-toggle-down")).toBeNull();
    // Sam's children are already shown through Ada, so Sam has nothing to reveal.
    const sam = card("Sam Archer")!.closest(".tree-node")!;
    expect(sam.querySelector(".tree-toggle-down")).toBeNull();
  });

  it("shows the selected person's details and links to the full profile", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 2 children of Ada Archer"));
    await cardFor("Ben Archer");
    fireEvent.click(card("Ben Archer")!);

    const inspector = await screen.findByRole("complementary", { name: "Ben Archer" });
    expect(within(inspector).getByText("Carpenter")).toBeTruthy();
    expect(within(inspector).getByText("Built the family house by the river.")).toBeTruthy();
    const parents = within(inspector).getByRole("heading", { name: "Parents" }).parentElement!;
    expect(within(parents).getByText("Ada Archer")).toBeTruthy();
    expect(within(parents).getByText("Sam Archer")).toBeTruthy();
    const children = within(inspector).getByRole("heading", { name: "Children" }).parentElement!;
    expect(within(children).getByText("Eli Archer")).toBeTruthy();
    expect(card("Ben Archer")!.getAttribute("aria-pressed")).toBe("true");

    const link = within(inspector).getByRole("link", { name: "Open full profile" });
    expect(link.getAttribute("href")).toBe(`/app/families/${FAMILY_ID}/people/ben`);
    fireEvent.click(link);
    expect(await screen.findByText("Profile page for ben")).toBeTruthy();
  });

  it("opens a hidden relative from the inspector by revealing their branch", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 2 children of Ada Archer"));
    await cardFor("Ben Archer");
    fireEvent.click(card("Ben Archer")!);
    const inspector = await screen.findByRole("complementary", { name: "Ben Archer" });
    fireEvent.click(within(inspector).getByRole("button", { name: /Eli Archer/ }));
    await cardFor("Eli Archer");
    expect(await screen.findByRole("complementary", { name: "Eli Archer" })).toBeTruthy();
  });

  it("does not open the profile when the + button is pressed", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 2 children of Ada Archer"));
    await cardFor("Ben Archer");
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.doubleClick(toggle("Hide children of Ada Archer"));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("focuses the tree on a person from a link", async () => {
    serve();
    renderTree(`/app/families/${FAMILY_ID}/tree?focus=eli`);
    await cardFor("Eli Archer");
    expect(shownIds()).toEqual(["ben", "dina", "eli"]);
    fireEvent.click(toggle("Show 2 parents of Ben Archer"));
    await cardFor("Ada Archer");
    expect(shownIds()).toEqual(["ada", "ben", "dina", "eli", "sam"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(shownIds()).toEqual(["ada", "gus", "sam"]));
  });
});

describe("loading and failures", () => {
  it("shows an error with a retry that recovers", async () => {
    let attempts = 0;
    serve({
      tree: () =>
        ++attempts === 1
          ? { status: 500, body: { error: { message: "Database unavailable." } } }
          : { status: 200, body: { people, edges } },
    });
    renderTree();
    expect(await screen.findByText("Database unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await cardFor("Ada Archer");
  });

  it("reports a rejected relationship without losing the graph, then adds one", async () => {
    serve();
    let reject = true;
    handlers.push((url, init) => {
      if (init?.method !== "POST") return undefined;
      expect(url).toBe(`/api/v1/families/${FAMILY_ID}/relationships/parent-child`);
      if (reject) {
        return {
          status: 409,
          body: { error: { code: "TREE_CYCLE", message: "That would create a loop." } },
        };
      }
      return {
        status: 201,
        body: { edge: { id: "e9", parentPersonId: "fay", childPersonId: "hal" } },
      };
    });
    await openTree();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const editor = await screen.findByRole("complementary", {
      name: "Connect a parent and child",
    });
    const [parent, child] = within(editor).getAllByRole("combobox");
    fireEvent.change(parent, { target: { value: "fay" } });
    fireEvent.change(child, { target: { value: "hal" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add relationship" }));
    expect(await within(editor).findByText("That would create a loop.")).toBeTruthy();
    expect(card("Ada Archer")).not.toBeNull();

    reject = false;
    fireEvent.click(within(editor).getByRole("button", { name: "Add relationship" }));
    expect(await screen.findByText("Relationship added.")).toBeTruthy();
    // The new edge is merged locally: no refetch, and Hal now has a card.
    await cardFor("Hal Nobody");
    expect(calls.filter((c) => c.url.endsWith("/tree"))).toHaveLength(1);
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      parentPersonId: "fay",
      childPersonId: "hal",
    });
  });

  it("ignores a slow response for a family the viewer has left", async () => {
    let releaseFirst: (() => void) | null = null;
    const otherPeople = [
      { id: "zoe", name: "Zoe Other" },
      { id: "yan", name: "Yan Other" },
    ];
    handlers.push((url) => {
      if (url === "/api/v1/families/fam-2") {
        return { status: 200, body: familyResponse("fam-2", "CREATOR", "The Others") };
      }
      if (url === "/api/v1/families/fam-2/tree") {
        return {
          status: 200,
          body: {
            people: otherPeople,
            edges: [{ id: "o1", parentPersonId: "zoe", childPersonId: "yan" }],
          },
        };
      }
      return undefined;
    });
    // The first family's tree answers only after we have moved on.
    const fetchMock = vi.mocked(fetch);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (input === `/api/v1/families/${FAMILY_ID}/tree`) {
        await new Promise<void>((resolve) => (releaseFirst = resolve));
        return json(200, { people, edges });
      }
      if (input === `/api/v1/families/${FAMILY_ID}`) return json(200, familyResponse());
      return base(input, init);
    });

    let go: ((path: string) => void) | null = null;
    function Navigator() {
      const navigate = useNavigate();
      go = navigate;
      return null;
    }
    render(
      <MemoryRouter initialEntries={[`/app/families/${FAMILY_ID}/tree`]}>
        <Navigator />
        <Routes>
          <Route path="/app/families/:familyId/tree" element={<TreePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(releaseFirst).not.toBeNull());
    act(() => go!("/app/families/fam-2/tree"));
    await cardFor("Zoe Other");
    await act(async () => releaseFirst!());
    await new Promise((r) => setTimeout(r, 50));
    expect(card("Ada Archer")).toBeNull();
    expect(shownIds()).toEqual(["zoe"]);
  });
});

describe("keyboard, touch and motion", () => {
  it("moves between people with the arrow keys and expands with +", async () => {
    serve();
    await openTree();
    const ada = card("Ada Archer")!;
    ada.focus();
    fireEvent.keyDown(ada, { key: "+" });
    await cardFor("Cleo Archer");
    fireEvent.keyDown(card("Ada Archer")!, { key: "ArrowRight" });
    const focusedId = (document.activeElement as HTMLElement).dataset.personId;
    expect(["ben", "cleo"]).toContain(focusedId);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(["ada", "sam"]).toContain((document.activeElement as HTMLElement).dataset.personId);
    // Enter/Space activate the card button natively: it is a real <button>.
    expect(card("Ada Archer")!.tagName).toBe("BUTTON");
    fireEvent.keyDown(card("Ada Archer")!, { key: "-" });
    await waitFor(() => expect(card("Ben Archer")).toBeNull());
  });

  it("closes the inspector with Escape", async () => {
    serve();
    await openTree();
    fireEvent.click(card("Ada Archer")!);
    const inspector = await screen.findByRole("complementary", { name: "Ada Archer" });
    fireEvent.keyDown(inspector, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  it("previews on mouse hover but not on touch", async () => {
    serve();
    await openTree();
    vi.useFakeTimers();
    fireEvent.pointerOver(card("Ada Archer")!, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(1000));
    expect(document.querySelector(".tree-preview")).toBeNull();
    fireEvent.pointerOut(card("Ada Archer")!, { pointerType: "touch" });
    fireEvent.pointerOver(card("Ada Archer")!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(1000));
    vi.useRealTimers();
    const preview = document.querySelector(".tree-preview");
    expect(preview?.textContent).toContain("Parent of Cleo Archer, Ben Archer");
  });

  it("uses large expansion targets", async () => {
    serve();
    await openTree();
    const button = toggle("Show 2 children of Ada Archer");
    expect(button.className).toContain("tree-toggle");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("animates new cards only when motion is allowed", async () => {
    serve();
    await openTree();
    fireEvent.click(toggle("Show 2 children of Ada Archer"));
    await cardFor("Ben Archer");
    expect(document.querySelectorAll(".tree-node.is-enter")).toHaveLength(0);
    expect(document.querySelectorAll(".tree-node.is-leave")).toHaveLength(0);

    setReducedMotion(false);
    renderTree();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-person-id="gus"]')).toHaveLength(2),
    );
    const secondGus = document.querySelectorAll<HTMLElement>('[data-person-id="gus"]')[1];
    const tree = secondGus.closest(".tree-canvas")!;
    fireEvent.click(
      within(tree as HTMLElement).getByRole("button", { name: "Show 1 child of Gus Moreau" }),
    );
    await waitFor(() =>
      expect(tree.querySelectorAll(".tree-node.is-enter").length).toBeGreaterThan(0),
    );
  });
});

describe("permissions in the UI", () => {
  it("hides editing controls from viewers", async () => {
    serve({ role: "VIEWER" });
    await openTree();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    fireEvent.click(card("Ada Archer")!);
    const inspector = await screen.findByRole("complementary", { name: "Ada Archer" });
    expect(within(inspector).queryByRole("button", { name: "Add a child" })).toBeNull();
  });

  it("offers editors the relationship controls", async () => {
    serve({ role: "EDITOR" });
    await openTree();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
  });
});
