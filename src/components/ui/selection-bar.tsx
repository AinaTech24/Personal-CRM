"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

/** Appears in place of the normal header actions once at least one row/card is selected. */
export function SelectionBar({
  count,
  allSelected,
  onSelectAll,
  onCancel,
  onDelete,
}: {
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2"
    >
      <span className="text-sm text-muted-foreground">{count} selected</span>
      <Button size="sm" variant="outline" onClick={onSelectAll}>
        {allSelected ? "Deselect all" : "Select all"}
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" variant="destructive" disabled={count === 0} onClick={onDelete}>
        Delete
      </Button>
    </motion.div>
  );
}
