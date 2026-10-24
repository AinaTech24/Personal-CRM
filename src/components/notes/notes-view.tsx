"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { IconNotes, IconPlus, IconSearch } from "@/components/icons";
import { NoteCard, type NoteRow } from "@/components/notes/note-card";
import { NoteEditorDialog } from "@/components/notes/note-editor-dialog";
import { FloatingNote, type FloatingState } from "@/components/notes/floating-note";

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

  // Unpinning also closes its floating panel, if open — a floating note only
  // ever exists because it's pinned, so the two states must move together.
  // Reloads afterward (rather than just splicing the local list) so an
  // active filter — e.g. the "Pinned" quick filter — drops a note the
  // instant it no longer matches, instead of leaving a stale row in place
  // until the next unrelated refresh.
  async function togglePin(note: NoteRow) {
    const nextPinned = !note.isPinned;
    await updateNote(note.id, { isPinned: nextPinned }).catch(() => {});
    if (!nextPinned) {
      setFloating((prev) => {
        if (!(note.id in prev)) return prev;
        const next = { ...prev };
        delete next[note.id];
        return next;
      });
    }
    load();
  }

  async function recolor(note: NoteRow, nextColor: string | null) {
    await updateNote(note.id, { color: nextColor }).catch(() => {});
  }

  function toggleFloat(note: NoteRow) {
    setFloating((prev) => {
      if (note.id in prev) {
        const next = { ...prev };
        delete next[note.id];
        return next;
      }
      const openCount = Object.keys(prev).length;
      return { ...prev, [note.id]: { x: 24 + openCount * 24, y: 24 + openCount * 24, minimized: false } };
    });
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              showAuthor={(isAdmin || isDeptAdmin) && note.authorId !== meId}
              onOpen={() => openEdit(note)}
              onTogglePin={() => togglePin(note)}
              onSetColor={(c) => recolor(note, c)}
              onDelete={() => setDeleting(note)}
              onToggleFloat={() => toggleFloat(note)}
              floating={note.id in floating}
            />
          ))}
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
        onSave={async (data) => {
          if (editingNote) {
            await updateNote(editingNote.id, data);
            if (!data.isPinned) {
              setFloating((prev) => {
                if (!(editingNote.id in prev)) return prev;
                const next = { ...prev };
                delete next[editingNote.id];
                return next;
              });
            }
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
