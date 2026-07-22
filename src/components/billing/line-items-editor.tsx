"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconPlus, IconTrash } from "@/components/icons";
import { formatMoney } from "@/lib/utils";
import type { LineItem } from "@/components/billing/types";

export function emptyLineItem(): LineItem {
  return { description: "", qty: 1, unitPrice: 0, gstRate: 18 };
}

export function lineTotalOf(item: LineItem) {
  return Math.round((item.qty || 0) * (item.unitPrice || 0) * 100) / 100;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Mirrors the server's computeTotals so the builder can preview figures live. */
export function previewTotals(items: LineItem[], discount = 0) {
  const subtotal = round2(items.reduce((sum, i) => sum + lineTotalOf(i), 0));
  const gstAmount = round2(items.reduce((sum, i) => sum + lineTotalOf(i) * ((i.gstRate || 0) / 100), 0));
  const total = round2(subtotal + gstAmount - (Number(discount) || 0));
  return { subtotal, gstAmount, total };
}

export function LineItemsEditor({
  items,
  onChange,
  showHsn = false,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  showHsn?: boolean;
}) {
  function update(index: number, patch: Partial<LineItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const cols = showHsn
    ? "sm:grid-cols-[1fr_90px_70px_100px_70px_100px_32px]"
    : "sm:grid-cols-[1fr_70px_100px_70px_100px_32px]";

  return (
    <div className="flex flex-col gap-2">
      <div className={`hidden items-center gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid ${cols}`}>
        <span>Description</span>
        {showHsn && <span>HSN/SAC</span>}
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">GST %</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      {items.map((item, index) => (
        <div key={index} className={`grid grid-cols-2 items-center gap-2 ${cols}`}>
          <Input
            className="col-span-2 sm:col-span-1"
            placeholder="Description"
            value={item.description}
            onChange={(e) => update(index, { description: e.target.value })}
          />
          {showHsn && (
            <Input
              placeholder="HSN/SAC"
              value={item.hsnSac ?? ""}
              onChange={(e) => update(index, { hsnSac: e.target.value })}
            />
          )}
          <Input
            type="number"
            min={0}
            step="0.01"
            className="text-right"
            placeholder="Qty"
            value={item.qty}
            onChange={(e) => update(index, { qty: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            className="text-right"
            placeholder="Price"
            value={item.unitPrice}
            onChange={(e) => update(index, { unitPrice: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            className="text-right"
            placeholder="GST"
            value={item.gstRate}
            onChange={(e) => update(index, { gstRate: Number(e.target.value) })}
          />
          <span className="text-right text-sm tabular-nums text-muted-foreground">
            {formatMoney(lineTotalOf(item))}
          </span>
          <button
            type="button"
            onClick={() => remove(index)}
            disabled={items.length === 1}
            aria-label="Remove line"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive disabled:opacity-30"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...items, emptyLineItem()])}
        className="mt-1 gap-1.5 self-start"
      >
        <IconPlus className="h-3.5 w-3.5" />
        Add line
      </Button>
    </div>
  );
}
