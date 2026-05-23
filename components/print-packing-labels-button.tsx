"use client";

import { PACKING_LABEL } from "@/lib/packing-label-spec";
import { printPackingLabels } from "@/lib/print-packing-labels";

export function PrintPackingLabelsButton({
  className = "btn btn-ghost btn-sm",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={className}
      title={PACKING_LABEL.printHint}
      onClick={() => printPackingLabels()}
      {...rest}
    >
      Print labels (1.5×1 in)
    </button>
  );
}
