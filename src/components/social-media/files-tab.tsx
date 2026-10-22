"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { IconChevronLeft, IconForward, IconPencil, IconTrash } from "@/components/icons";
import { LottieIcon } from "@/components/icons/lottie-icon";
import { useToast } from "@/components/providers/toast-provider";

interface TabCreateHandle {
  openCreate: () => void;
}

interface ActorRef {
  id: string;
  name: string;
}

interface FolderRow {
  id: string;
  name: string;
  createdBy: ActorRef;
  createdAt: string;
  _count: { images: number };
}

interface ImageRow {
  id: string;
  fileName: string;
  filePath: string;
  folderId: string;
  uploadedBy: ActorRef;
  createdAt: string;
}

/**
 * The client's own image library: a flat set of folders, each holding
 * uploaded images — create/rename/delete a folder, upload/rename/move/delete
 * an image, and click any image to view it full-size. Same base64-in-MySQL
 * upload shape as reports/tasks/projects; access is inherited from the
 * parent client the same way content/ads/reports already work.
 */
export const FilesTab = forwardRef<TabCreateHandle, { clientId: string; onChanged: () => void }>(function FilesTab(
  { clientId, onChanged },
  ref
) {
  const toast = useToast();
  const [folders, setFolders] = useState<FolderRow[] | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderRow | null>(null);
  const [images, setImages] = useState<ImageRow[] | null>(null);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderRow | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderRow | null>(null);

  const [renamingImage, setRenamingImage] = useState<ImageRow | null>(null);
  const [imageName, setImageName] = useState("");
  const [movingImage, setMovingImage] = useState<ImageRow | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [deleteImageTarget, setDeleteImageTarget] = useState<ImageRow | null>(null);
  const [viewingImage, setViewingImage] = useState<ImageRow | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadFolders() {
    const res = await fetch(`/api/social/clients/${clientId}/folders`);
    const data = await res.json();
    if (res.ok) setFolders(data.folders);
  }

  async function loadImages(folderId: string) {
    const res = await fetch(`/api/social/folders/${folderId}/images`);
    const data = await res.json();
    if (res.ok) setImages(data.images);
  }

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!activeFolder) return;
    setImages(null);
    loadImages(activeFolder.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder?.id]);

  // The shared "+" button in the tab bar: create a folder at the root, or
  // jump straight to the file picker once inside one — whichever "add" makes
  // sense for where the user currently is.
  function openCreate() {
    if (activeFolder) {
      fileInputRef.current?.click();
    } else {
      setEditingFolder(null);
      setFolderName("");
      setFolderDialogOpen(true);
    }
  }

  useImperativeHandle(ref, () => ({ openCreate }));

  function openEditFolder(folder: FolderRow) {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDialogOpen(true);
  }

  async function saveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderName.trim()) return;
    setSaving(true);
    try {
      const res = editingFolder
        ? await fetch(`/api/social/folders/${editingFolder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: folderName.trim() }),
          })
        : await fetch(`/api/social/clients/${clientId}/folders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: folderName.trim() }),
          });
      const data = await res.json();
      if (!res.ok) return toast.error(editingFolder ? "Couldn't rename folder" : "Couldn't create folder", data.error);
      setFolderDialogOpen(false);
      toast.success(editingFolder ? "Folder renamed" : "Folder created");
      loadFolders();
      if (!editingFolder) onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteFolder() {
    if (!deleteFolderTarget) return;
    const res = await fetch(`/api/social/folders/${deleteFolderTarget.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete folder");
    toast.success(`${deleteFolderTarget.name} deleted`);
    const wasActive = activeFolder?.id === deleteFolderTarget.id;
    setDeleteFolderTarget(null);
    if (wasActive) setActiveFolder(null);
    loadFolders();
    onChanged();
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !activeFolder) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch(`/api/social/folders/${activeFolder.id}/images`, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) toast.error(`Couldn't upload ${file.name}`, data.error);
      }
      loadImages(activeFolder.id);
      loadFolders(); // image counts shown on the folder cards
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openRenameImage(image: ImageRow) {
    setRenamingImage(image);
    setImageName(image.fileName);
  }

  async function saveImageName(e: React.FormEvent) {
    e.preventDefault();
    if (!renamingImage || !imageName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/social/images/${renamingImage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: imageName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't rename image", data.error);
      setRenamingImage(null);
      toast.success("Image renamed");
      if (activeFolder) loadImages(activeFolder.id);
    } finally {
      setSaving(false);
    }
  }

  function openMoveImage(image: ImageRow) {
    setMovingImage(image);
    setMoveTargetId("");
  }

  async function confirmMoveImage() {
    if (!movingImage || !moveTargetId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/social/images/${movingImage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: moveTargetId }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't move image", data.error);
      setMovingImage(null);
      toast.success("Image moved");
      if (activeFolder) loadImages(activeFolder.id);
      loadFolders();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteImage() {
    if (!deleteImageTarget) return;
    const res = await fetch(`/api/social/images/${deleteImageTarget.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete image");
    toast.success("Image deleted");
    setDeleteImageTarget(null);
    if (activeFolder) loadImages(activeFolder.id);
    loadFolders();
  }

  const folderDialog = (
    <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingFolder ? "Rename folder" : "New folder"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="folder-form" onSubmit={saveFolder} className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">Name</Label>
            <Input id="folder-name" value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus required />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="folder-form" disabled={saving}>
            {saving ? "Saving..." : editingFolder ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const deleteFolderDialog = (
    <ConfirmDialog
      open={!!deleteFolderTarget}
      onOpenChange={(v) => !v && setDeleteFolderTarget(null)}
      title={`Delete ${deleteFolderTarget?.name}?`}
      description={`This permanently deletes the folder and all ${deleteFolderTarget?._count.images ?? 0} image(s) inside it. This cannot be undone.`}
      onConfirm={confirmDeleteFolder}
    />
  );

  // ---------- Root: folder grid ----------
  if (!activeFolder) {
    return (
      <div className="flex flex-col gap-4">
        {folders === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : folders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No folders yet. Add one to start organizing images.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {folders.map((folder) => (
              <Card
                key={folder.id}
                className="group relative cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                onClick={() => setActiveFolder(folder)}
              >
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Tooltip label="Rename">
                    <button
                      type="button"
                      aria-label={`Rename ${folder.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditFolder(folder);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <button
                      type="button"
                      aria-label={`Delete ${folder.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteFolderTarget(folder);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  <LottieIcon src="/icons/Folder.json" size={48} colorClassName="text-primary/70" />
                  <p className="w-full truncate text-sm font-medium">{folder.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {folder._count.images} image{folder._count.images === 1 ? "" : "s"}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {folderDialog}
        {deleteFolderDialog}
      </div>
    );
  }

  // ---------- Inside a folder: image grid ----------
  const otherFolders = (folders ?? []).filter((f) => f.id !== activeFolder.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActiveFolder(null)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" />
          Back to folders
        </button>
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">{activeFolder.name}</h3>
          <Tooltip label="Rename folder">
            <button
              type="button"
              aria-label={`Rename ${activeFolder.name}`}
              onClick={() => openEditFolder(activeFolder)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
            >
              <IconPencil className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip label="Delete folder">
            <button
              type="button"
              aria-label={`Delete ${activeFolder.name}`}
              onClick={() => setDeleteFolderTarget(activeFolder)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      <div>
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "Uploading..." : "Upload images"}
        </Button>
      </div>

      {images === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No images yet. Upload one to get started.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image) => (
            <Card key={image.id} className="group relative overflow-hidden p-0">
              <button
                type="button"
                aria-label={`View ${image.fileName}`}
                className="block aspect-square w-full overflow-hidden bg-muted/40"
                onClick={() => setViewingImage(image)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/uploads/${image.filePath}?mode=view`}
                  alt={image.fileName}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
              <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Tooltip label="Rename">
                  <button
                    type="button"
                    aria-label={`Rename ${image.fileName}`}
                    onClick={() => openRenameImage(image)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground"
                  >
                    <IconPencil className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
                <Tooltip label="Move to another folder">
                  <button
                    type="button"
                    aria-label={`Move ${image.fileName}`}
                    onClick={() => openMoveImage(image)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground"
                  >
                    <IconForward className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
                <Tooltip label="Delete">
                  <button
                    type="button"
                    aria-label={`Delete ${image.fileName}`}
                    onClick={() => setDeleteImageTarget(image)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:text-destructive"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              </div>
              <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{image.fileName}</p>
            </Card>
          ))}
        </div>
      )}

      {folderDialog}
      {deleteFolderDialog}

      {/* Rename image */}
      <Dialog open={!!renamingImage} onOpenChange={(v) => !v && setRenamingImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename image</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="image-name-form" onSubmit={saveImageName} className="flex flex-col gap-1.5">
              <Label htmlFor="image-name">File name</Label>
              <Input id="image-name" value={imageName} onChange={(e) => setImageName(e.target.value)} autoFocus required />
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="image-name-form" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move image */}
      <Dialog open={!!movingImage} onOpenChange={(v) => !v && setMovingImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {movingImage?.fileName}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {otherFolders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other folders to move this into yet — create one first.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="move-target">Destination folder</Label>
                <Dropdown
                  id="move-target"
                  value={moveTargetId}
                  onChange={setMoveTargetId}
                  placeholder="Choose a folder"
                  options={otherFolders.map((f) => ({ value: f.id, label: f.name }))}
                />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={confirmMoveImage} disabled={saving || !moveTargetId}>
              {saving ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteImageTarget}
        onOpenChange={(v) => !v && setDeleteImageTarget(null)}
        title={`Delete ${deleteImageTarget?.fileName}?`}
        description="This permanently deletes the image. This cannot be undone."
        onConfirm={confirmDeleteImage}
      />

      {/* Full-size view */}
      <Dialog open={!!viewingImage} onOpenChange={(v) => !v && setViewingImage(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{viewingImage?.fileName}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex items-center justify-center">
            {viewingImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/uploads/${viewingImage.filePath}?mode=view`}
                alt={viewingImage.fileName}
                className="max-h-[65dvh] w-auto max-w-full rounded-md object-contain"
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
});
