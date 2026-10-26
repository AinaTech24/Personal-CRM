"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { IconNotes, IconPictureInPicture, IconPlus, IconSearch } from "@/components/icons";
import { NoteCard, type NoteRow } from "@/components/notes/note-card";
import { NoteEditorDialog } from "@/components/notes/note-editor-dialog";
import { FloatingNote, type FloatingState } from "@/components/notes/floating-note";
import { DesktopNotesPanel } from "@/components/notes/desktop-notes-panel";
import { isDocumentPipSupported, openDocumentPip } from "@/lib/document-pip";
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
  const [rawQuery, setRawQuery] = useState("");
  const [q, setQ] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState("updated");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteRow | null>(null);
  const [deleting, setDeleting] = useState<NoteRow | null>(null);
  const [floating, setFloating] = useState<Record<string, FloatingState>>({});

  // Document Picture-in-Picture: a real OS-level window that floats on top
  // of other applications, not just other browser tabs. Chromium-only
  // (Chrome/Edge/Brave) — resolved after mount to avoid a server/client
  // render mismatch, since `window` isn't available during SSR.
  const [pipSupported, setPipSupported] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  useEffect(() => setPipSupported(isDocumentPipSupported()), []);

  async function toggleDesktopPanel() {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }
    const pip = await openDocumentPip({ width: 320, height: 480 });
    if (!pip) {
      toast.error("Couldn't pop out", "Try Chrome, Edge, or Brave — this isn't supported in every browser.");
      return;
    }
    pip.addEventListener("pagehide", () => setPipWindow(null), { once: true });
    setPipWindow(pip);
  }

  // Closes the pop-out if it's still open when Notes unmounts (e.g.
  // navigating away) — it's a companion to this page, not a standalone window.
  useEffect(() => {
    return () => {
      pipWindow?.close();
    };
  }, [pipWindow]);

  // Restoring from localStorage only once (per meId resolving) — and only
  // persisting afterward — avoids overwriting a just-restored state with the
  // empty default before it has a chance to load.
  const floatingRestoredRef = useRef(false);

  // Floating panels otherwise live only in React state, so a refresh would
  // silently drop them even though the notes are still pinned — restore
  // whichever ones this browser had open last, keyed per-user since the
  // browser profile may be shared.
  useEffect(() => {
    if (!meId || floatingRestoredRef.current) return;
    floatingRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(`notes-floating:${meId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Partial<FloatingState>>;
      if (!parsed || typeof parsed !== "object") return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const minX = safeAreaInset("--safe-left");
      const minY = safeAreaInset("--safe-top");
      const restored: Record<string, FloatingState> = {};
      for (const [id, v] of Object.entries(parsed)) {
        if (!v || typeof v.x !== "number" || typeof v.y !== "number") continue;
        restored[id] = {
          x: Math.min(Math.max(minX, v.x), Math.max(minX, w - 260)),
          y: Math.min(Math.max(minY, v.y), Math.max(minY, h - 40)),
          minimized: !!v.minimized,
        };
      }
      if (Object.keys(restored).length > 0) setFloating(restored);
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

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (quickFilter !== "all") params.set("filter", quickFilter);
    if (sort !== "updated") params.set("sort", sort);
    if (departmentFilter) params.set("departmentId", departmentFilter);
    if (authorFilter) params.set("authorId", authorFilter);

    const res = await fetch(`/api/notes?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setNotes(data.notes ?? []);
  }, [q, quickFilter, sort, departmentFilter, authorFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-refresh when anyone's note changes in a way that could affect this list.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => load();
    socket.on("note_created", refresh);
    socket.on("note_updated", refresh);
    socket.on("note_deleted", refresh);
    return () => {
      socket.off("note_created", refresh);
      socket.off("note_updated", refresh);
      socket.off("note_deleted", refresh);
    };
  }, [socket, load]);

  const authorOptions = useMemo(() => {
    const me = meId ? [{ value: meId, label: "Me" }] : [];
    return [{ value: "", label: "Everyone" }, ...me, ...candidates.map((c) => ({ value: c.id, label: [c.name, c.surname].filter(Boolean).join(" ") }))];
  }, [candidates, meId]);

  async function createNote(data: { title: string; content: string; color: string | null; isPinned: boolean }) {
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
    load();
  }

  async function updateNote(id: string, data: Partial<{ title: string; content: string; color: string | null; isPinned: boolean }>) {
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
      setFloating((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    setDeleting(null);
  }

  function openCreate() {
    setEditingNote(null);
    setEditorOpen(true);
  }
  function openEdit(note: NoteRow) {
    setEditingNote(note);
    setEditorOpen(true);
  }

  function openFloat(id: string) {
    setFloating((prev) => {
      if (id in prev) return prev;
      const openCount = Object.keys(prev).length;
      // Clears the app's own sticky topbar (h-14 + the device's safe-area
      // inset) so a freshly-opened panel doesn't spawn already overlapping
      // it — it's still freely draggable from there afterward.
      const x = 24 + safeAreaInset("--safe-left") + openCount * 24;
      const y = 72 + safeAreaInset("--safe-top") + openCount * 24;
      return { ...prev, [id]: { x, y, minimized: false } };
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
    load();
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
    load();
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
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search notes…" className="pl-8" />
          </div>
          <Tooltip
            label={
              !pipSupported
                ? "Needs Chrome, Edge, or Brave"
                : pipWindow
                  ? "Return pinned notes to this window"
                  : "Pop pinned notes out to a floating desktop window"
            }
          >
            <span>
              <Button
                type="button"
                variant={pipWindow ? "default" : "outline"}
                size="icon"
                aria-label={pipWindow ? "Return pinned notes to this window" : "Pop pinned notes out to a floating desktop window"}
                onClick={toggleDesktopPanel}
                disabled={!pipSupported}
              >
                <IconPictureInPicture className="h-4 w-4" />
              </Button>
            </span>
          </Tooltip>
          <Tooltip label="New note">
            <Button type="button" size="icon" aria-label="New note" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
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
            {q || quickFilter !== "all" || departmentFilter || authorFilter ? "No notes match these filters." : "No notes yet. Create one to get started."}
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
              onOpen={() => openEdit(note)}
              onTogglePin={() => togglePin(note)}
              onSetColor={(c) => recolor(note, c)}
              onDelete={() => setDeleting(note)}
              onToggleFloat={() => toggleFloat(note)}
              onDuplicate={() => duplicateNote(note)}
              floating={note.id in floating}
            />
          ))}
        </div>
      )}

      {pipWindow
        ? createPortal(
            <DesktopNotesPanel
              notes={floatingNotes}
              onEdit={(note) => {
                openEdit(note);
                window.focus();
              }}
              onUnpin={(note) => togglePin(note)}
            />,
            pipWindow.document.body
          )
        : floatingNotes.map((note) => (
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
        description={deleting ? `"${deleting.title || "Untitled note"}" will be permanently deleted.` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
