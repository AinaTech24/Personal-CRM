"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { SelectionBar } from "@/components/ui/selection-bar";
import { useToast } from "@/components/providers/toast-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { IconNotes, IconPlus, IconSearch } from "@/components/icons";
import { NoteCard, type NoteRow } from "@/components/notes/note-card";
import { NoteEditorDialog } from "@/components/notes/note-editor-dialog";
import { FloatingNote, type FloatingState } from "@/components/notes/floating-note";
import { safeAreaInset } from "@/lib/safe-area";

type QuickFilter = "all" | "pinned" | "mine";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All notes" },
  { value: "pinned", label: "Pinned" },
  { value: "mine", label: "My notes" },
];

const SORT_OPTIONS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title" },
  { value: "pinned", label: "Pinned first" },
];

/** How many notes a single fetch loads — both the initial page and each "Load more". */
const PAGE_SIZE = 50;

interface Candidate {
  id: string;
  name: string;
  surname: string | null;
}

export function NotesView() {
  const toast = useToast();
  const { socket } = useSocket();

  const [meId, setMeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeptAdmin, setIsDeptAdmin] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [q, setQ] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState("updated");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteRow | null>(null);
  const [deleting, setDeleting] = useState<NoteRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [floating, setFloating] = useState<Record<string, FloatingState>>({});

  // Restoring from localStorage only once (per meId resolving) — and only
  // persisting afterward — avoids overwriting a just-restored state with the
  // empty default before it has a chance to load.
  const floatingRestoredRef = useRef(false);

  // The floating panel otherwise lives only in React state, so a refresh
  // would silently drop it even though the note is still pinned — restore
  // whichever one this browser had open last, keyed per-user since the
  // browser profile may be shared. Only one note ever floats at a time, so
  // this restores at most one entry even if an older session left more than
  // one behind.
  useEffect(() => {
    if (!meId || floatingRestoredRef.current) return;
    floatingRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(`notes-floating:${meId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Partial<FloatingState>>;
      if (!parsed || typeof parsed !== "object") return;
      const entry = Object.entries(parsed).at(-1);
      if (!entry) return;
      const [id, v] = entry;
      if (!v || typeof v.x !== "number" || typeof v.y !== "number") return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const minX = safeAreaInset("--safe-left");
      const minY = safeAreaInset("--safe-top");
      setFloating({
        [id]: {
          x: Math.min(Math.max(minX, v.x), Math.max(minX, w - 260)),
          y: Math.min(Math.max(minY, v.y), Math.max(minY, h - 40)),
          minimized: !!v.minimized,
        },
      });
    } catch {
      // Corrupted or inaccessible storage (e.g. private browsing) — just start empty.
    }
  }, [meId]);

  useEffect(() => {
    if (!meId || !floatingRestoredRef.current) return;
    try {
      localStorage.setItem(`notes-floating:${meId}`, JSON.stringify(floating));
    } catch {
      // Storage full or blocked — floating panels still work for this session, just won't survive a refresh.
    }
  }, [floating, meId]);

  // Debounce free-text search so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setQ(rawQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMeId(d.user?.id ?? null);
        setIsAdmin(d.user?.role === "SUPER_ADMIN" || d.user?.role === "ADMIN");
        setIsDeptAdmin(!!d.user?.isDepartmentAdmin);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // A Department Admin's own notes + their department's are already the
    // entire scope they can ever see — a department filter would only ever
    // have one meaningful value for them, so it's an Admin-only control.
    if (isAdmin) {
      fetch("/api/departments")
        .then((r) => r.json())
        .then((d) => setDepartments(d.departments ?? []))
        .catch(() => {});
    }
    if (isAdmin || isDeptAdmin) {
      fetch("/api/admin/permissions/users")
        .then((r) => r.json())
        .then((d) => setCandidates(d.users ?? []))
        .catch(() => {});
    }
  }, [isAdmin, isDeptAdmin]);

  function notesSearchParams(opts: { take: number; skip: number }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (quickFilter !== "all") params.set("filter", quickFilter);
    if (sort !== "updated") params.set("sort", sort);
    if (departmentFilter) params.set("departmentId", departmentFilter);
    if (authorFilter) params.set("authorId", authorFilter);
    if (tagFilter) params.set("tag", tagFilter);
    params.set("take", String(opts.take));
    if (opts.skip) params.set("skip", String(opts.skip));
    return params.toString();
  }

  // The one reactive fetch: re-runs (resetting to the first page) whenever a
  // filter, sort, or the search query changes. `take` lets a live-update
  // refresh ask for as many notes as were already loaded, instead of
  // collapsing the grid back to page one.
  const load = useCallback(
    async (take: number = PAGE_SIZE) => {
      const qs = notesSearchParams({ take: Math.max(take, PAGE_SIZE), skip: 0 });
      const res = await fetch(`/api/notes?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotes(data.notes ?? []);
        setTotal(data.total ?? 0);
        setHasMore(!!data.hasMore);
      }
    },
    [q, quickFilter, sort, departmentFilter, authorFilter, tagFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function loadMore() {
    setLoadingMore(true);
    try {
      const qs = notesSearchParams({ take: PAGE_SIZE, skip: notes?.length ?? 0 });
      const res = await fetch(`/api/notes?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load more notes", data.error);
      setNotes((prev) => [...(prev ?? []), ...(data.notes ?? [])]);
      setTotal(data.total ?? 0);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  // A live update re-fetches in place, preserving however many notes were
  // already loaded (via "Load more"), rather than collapsing the grid back
  // to page one.
  function refreshNotes() {
    return load(notes?.length ?? PAGE_SIZE);
  }

  // The tag filter's own option list and the editor's autocomplete share this
  // — every tag across the notes this user can see, not just the ones in the
  // current (possibly already tag-filtered) result set.
  const loadTags = useCallback(async () => {
    const res = await fetch("/api/notes/tags");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setAvailableTags(data.tags ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Live-refresh when anyone's note changes in a way that could affect this list.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      refreshNotes();
      loadTags();
    };
    socket.on("note_created", refresh);
    socket.on("note_updated", refresh);
    socket.on("note_deleted", refresh);
    return () => {
      socket.off("note_created", refresh);
      socket.off("note_updated", refresh);
      socket.off("note_deleted", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, load, loadTags, notes?.length]);

  const authorOptions = useMemo(() => {
    const me = meId ? [{ value: meId, label: "Me" }] : [];
    return [{ value: "", label: "Everyone" }, ...me, ...candidates.map((c) => ({ value: c.id, label: [c.name, c.surname].filter(Boolean).join(" ") }))];
  }, [candidates, meId]);

  async function createNote(data: { title: string; content: string; color: string | null; isPinned: boolean; tags: string[] }) {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't create note", body.error);
      throw new Error(body.error);
    }
    toast.success("Note created");
    if (data.isPinned && body.note?.id) openFloat(body.note.id);
    refreshNotes();
    if (data.tags.length > 0) loadTags();
  }

  async function updateNote(id: string, data: Partial<{ title: string; content: string; color: string | null; isPinned: boolean; tags: string[] }>) {
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't save note", body.error);
      throw new Error(body.error);
    }
    setNotes((prev) => (prev ? prev.map((n) => (n.id === id ? body.note : n)) : prev));
    if (data.tags !== undefined) loadTags();
    return body.note as NoteRow;
  }

  async function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete note");
    } else {
      toast.success("Note deleted");
      setNotes((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
      setTotal((t) => Math.max(0, t - 1));
      setFloating((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    setDeleting(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllIds(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectedIds(new Set());
  }

  /** The grid's own click handler — while anything is selected, clicking a card toggles it instead of opening the editor (same convention as the leads board). */
  function handleCardOpen(note: NoteRow) {
    if (selectedIds.size > 0) toggleSelected(note.id);
    else openEdit(note);
  }

  async function handleBulkDelete() {
    const res = await fetch("/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't delete notes");
      return;
    }
    toast.success(
      `Deleted ${body.deleted} note${body.deleted === 1 ? "" : "s"}`,
      body.skipped > 0 ? `${body.skipped} skipped — no delete access` : undefined
    );
    setFloating((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of selectedIds) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    exitSelectionMode();
    refreshNotes();
  }

  function openCreate() {
    setEditingNote(null);
    setEditorOpen(true);
  }
  function openEdit(note: NoteRow) {
    setEditingNote(note);
    setEditorOpen(true);
  }

  // Only one note floats at a time — opening a new one replaces whichever
  // was already open instead of stacking another panel on screen.
  function openFloat(id: string) {
    setFloating((prev) => {
      if (id in prev && Object.keys(prev).length === 1) return prev;
      // Clears the app's own sticky topbar (h-14 + the device's safe-area
      // inset) so the panel doesn't spawn already overlapping it — it's
      // still freely draggable from there afterward.
      const x = 24 + safeAreaInset("--safe-left");
      const y = 72 + safeAreaInset("--safe-top");
      return { [id]: prev[id] ?? { x, y, minimized: false } };
    });
  }

  function closeFloat(id: string) {
    setFloating((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // Pinning and unpinning always move the floating panel with them — a
  // floating note only ever exists because it's pinned, so there's no
  // separate "pin but don't show it" state to end up in. Reloads afterward
  // (rather than just splicing the local list) so an active filter — e.g.
  // the "Pinned" quick filter — drops a note the instant it no longer
  // matches, instead of leaving a stale row in place until the next
  // unrelated refresh.
  async function togglePin(note: NoteRow) {
    const nextPinned = !note.isPinned;
    // Optimistic: flip the card and open/close its floating panel right on
    // click, instead of waiting on the PATCH round trip to even start —
    // that's what made pinning feel laggy. Reverted below if the save fails.
    setNotes((prev) => (prev ? prev.map((n) => (n.id === note.id ? { ...n, isPinned: nextPinned } : n)) : prev));
    if (nextPinned) openFloat(note.id);
    else closeFloat(note.id);

    const saved = await updateNote(note.id, { isPinned: nextPinned }).catch(() => null);
    if (!saved) {
      setNotes((prev) => (prev ? prev.map((n) => (n.id === note.id ? { ...n, isPinned: !nextPinned } : n)) : prev));
      if (nextPinned) closeFloat(note.id);
      else openFloat(note.id);
      return;
    }
    refreshNotes();
  }

  async function recolor(note: NoteRow, nextColor: string | null) {
    await updateNote(note.id, { color: nextColor }).catch(() => {});
  }

  async function duplicateNote(note: NoteRow) {
    const res = await fetch(`/api/notes/${note.id}/duplicate`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't duplicate the note", body.error);
      return;
    }
    toast.success("Note duplicated");
    refreshNotes();
  }

  function toggleFloat(note: NoteRow) {
    if (note.id in floating) closeFloat(note.id);
    else openFloat(note.id);
  }

  const floatingNotes = notes?.filter((n) => n.id in floating) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Notes</h1>
          <HelpDialog title="Notes — help">
            <HelpSection heading="What this page is for">
              <p>Capture ideas, keep track of information, and organize your notes — searchable, color-coded, and with pinned notes available as small floating panels you can drag anywhere on screen while this page is open.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See and manage every note, across every department.</p>
            </HelpSection>
            <HelpSection heading="Department Admins">
              <p>See and manage their own notes, plus every note belonging to someone in their own department — including other Department Admins. The original author stays attached to a note even after you edit it.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>Only your own notes — nobody else, including an admin&apos;s own view, replaces that; you simply can&apos;t see or change another person&apos;s notes at all.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        {selectedIds.size > 0 ? (
          <SelectionBar
            count={selectedIds.size}
            allSelected={!!notes && notes.length > 0 && notes.every((n) => selectedIds.has(n.id))}
            onSelectAll={() => toggleSelectAllIds((notes ?? []).map((n) => n.id))}
            onCancel={exitSelectionMode}
            onDelete={() => setBulkDeleteConfirm(true)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative w-52">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search notes…" className="pl-8" />
            </div>
            <Tooltip label="New note">
              <Button type="button" size="icon" aria-label="New note" onClick={openCreate}>
                <IconPlus className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setQuickFilter(f.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                quickFilter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/5"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Dropdown size="sm" value={sort} onChange={setSort} options={SORT_OPTIONS} className="w-40" />
        {availableTags.length > 0 && (
          <Dropdown
            size="sm"
            value={tagFilter}
            onChange={setTagFilter}
            options={[{ value: "", label: "Any tag" }, ...availableTags.map((t) => ({ value: t, label: t }))]}
            className="w-36"
          />
        )}
        {isAdmin && departments.length > 0 && (
          <Dropdown
            size="sm"
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={[{ value: "", label: "Any department" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            className="w-44"
          />
        )}
        {(isAdmin || isDeptAdmin) && (
          <Dropdown size="sm" value={authorFilter} onChange={setAuthorFilter} options={authorOptions} className="w-40" />
        )}
      </div>

      {!notes ? (
        <SkeletonList rows={4} />
      ) : notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <IconNotes className="h-6 w-6" />
            {q || quickFilter !== "all" || departmentFilter || authorFilter || tagFilter ? "No notes match these filters." : "No notes yet. Create one to get started."}
          </CardContent>
        </Card>
      ) : (
        // CSS columns rather than a strict grid — cards of different heights
        // stack into a staggered, scattered-sticky-note layout instead of
        // lining up in rigid rows.
        <div className="columns-1 gap-5 rounded-2xl bg-muted/30 p-6 sm:columns-2 lg:columns-3 xl:columns-4">
          {notes.map((note, i) => (
            <NoteCard
              key={note.id}
              note={note}
              index={i}
              showAuthor={(isAdmin || isDeptAdmin) && note.authorId !== meId}
              onOpen={() => handleCardOpen(note)}
              onTogglePin={() => togglePin(note)}
              onSetColor={(c) => recolor(note, c)}
              onDelete={() => setDeleting(note)}
              onToggleFloat={() => toggleFloat(note)}
              onDuplicate={() => duplicateNote(note)}
              floating={note.id in floating}
              selected={selectedIds.has(note.id)}
              selectionMode={selectedIds.size > 0}
              onToggleSelect={() => toggleSelected(note.id)}
            />
          ))}
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="flex items-center justify-center gap-3 py-1">
          <span className="text-xs text-muted-foreground">
            Showing {notes.length} of {total} note{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      )}

      {floatingNotes.map((note) => (
        <FloatingNote
          key={note.id}
          note={note}
          state={floating[note.id]}
          onMove={(x, y) => setFloating((prev) => ({ ...prev, [note.id]: { ...prev[note.id], x, y } }))}
          onToggleMinimize={() =>
            setFloating((prev) => ({ ...prev, [note.id]: { ...prev[note.id], minimized: !prev[note.id].minimized } }))
          }
          onClose={() => toggleFloat(note)}
          onEdit={() => openEdit(note)}
        />
      ))}

      <NoteEditorDialog
        note={editingNote}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        tagSuggestions={availableTags}
        onSave={async (data) => {
          if (editingNote) {
            await updateNote(editingNote.id, data);
            if (data.isPinned) openFloat(editingNote.id);
            else closeFloat(editingNote.id);
          } else {
            await createNote(data);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this note?"
        description={
          deleting
            ? `"${deleting.title || "Untitled note"}" moves to Trash, where it'll stay recoverable for 30 days before being permanently deleted.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        onOpenChange={setBulkDeleteConfirm}
        title={`Delete ${selectedIds.size} note${selectedIds.size === 1 ? "" : "s"}?`}
        description="These notes move to Trash, where they'll stay recoverable for 30 days before being permanently deleted. Any you don't actually have delete access to will be skipped."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
