"use client";

import { PackingLabel } from "@/components/packing-label";
import type { PackingLabelItem } from "@/lib/packing-label-spec";

type Zoom = 1 | 2 | 3;

const zoomClass: Record<Zoom, string> = {
  1: "",
  2: "packing-label-preview-stage--zoom-2",
  3: "packing-label-preview-stage--zoom-3",
};

/** On-screen true-size (or zoomed) preview — same component/CSS as print output. */
export function PackingLabelPreview({
  item,
  zoom = 2,
  className = "",
}: {
  item: PackingLabelItem;
  zoom?: Zoom;
  className?: string;
}) {
  return (
    <div
      className={`packing-label-preview-stage inline-block ${zoomClass[zoom]} ${className}`.trim()}
    >
      <PackingLabel {...item} />
    </div>
  );
}
