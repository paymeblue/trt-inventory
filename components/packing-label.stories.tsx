import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { printPackingLabels } from "@/lib/print-packing-labels";
import {
  PackingLabel,
} from "@/components/packing-label";
import { PACKING_LABEL } from "@/lib/packing-label-spec";

const labelDocs = `${PACKING_LABEL.printerModel} · ${PACKING_LABEL.widthIn}×${PACKING_LABEL.heightIn} in (${PACKING_LABEL.widthMm}×${PACKING_LABEL.heightMm} mm). Dashed outline = exact print size.`;

const previewZoom3 = (Story: () => ReactNode) => (
  <div className="packing-label-preview-stage packing-label-preview-stage--zoom-3 rounded-lg bg-[#e8e8e8] p-8">
    <Story />
  </div>
);

const previewTrueSize = (Story: () => ReactNode) => (
  <div className="packing-label-preview-stage rounded-lg bg-[#e8e8e8] p-8">
    <Story />
  </div>
);

const meta = {
  title: "Print/Packing label (XP-365B)",
  component: PackingLabel,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: labelDocs,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    barcode: { control: "text" },
    productId: { control: "text" },
    productName: { control: "text" },
    printedScanToken: { control: "text" },
  },
  args: {
    barcode: "TRT-ABCDEFGHIJ01",
    productId: "cru-xx-002",
    productName: "Ceiling unit replacement",
  },
} satisfies Meta<typeof PackingLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default sticker — 3× zoom for comfortable inspection on screen. */
export const ZoomedPreview: Story = {
  decorators: [previewZoom3],
};

/** True 1.5×1 in on screen — hold a physical label up to the monitor. */
export const TrueSize: Story = {
  decorators: [previewTrueSize],
};

export const LongProductName: Story = {
  args: {
    productName:
      "Extra long inventory description that should wrap within the label",
  },
  decorators: [previewZoom3],
};

export const SkuOnly: Story = {
  args: {
    productName: null,
    productId: "fd-fd-001",
  },
  decorators: [previewZoom3],
};

const sampleItems = [
  {
    barcode: "TRT-ABCDEFGHIJ01",
    productId: "er-fr-001",
    productName: "Emergency first aid kit",
  },
  {
    barcode: "TRT-ABCDEFGHIJ02",
    productId: "cru-xx-002",
    productName: "Ceiling unit replacement",
  },
  {
    barcode: "TRT-ABCDEFGHIJ03",
    productId: "fd-fd-001",
    productName: "Fire door assembly",
  },
] as const;

/** All sample lines stacked — matches production print sheet (one label per page when printing). */
export const PrintSheet: Story = {
  render: () => (
    <div className="packing-label-print-root !block space-y-4 bg-white p-4">
      {sampleItems.map((item) => (
        <PackingLabel key={item.barcode} {...item} />
      ))}
    </div>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: PACKING_LABEL.printHint,
      },
    },
  },
};

/** Side-by-side comparison at true size. */
export const ThreeUp: Story = {
  render: () => (
    <div className="packing-label-preview-stage flex flex-col gap-3 rounded-lg bg-[#e8e8e8] p-6">
      {sampleItems.map((item) => (
        <PackingLabel key={item.barcode} {...item} />
      ))}
    </div>
  ),
  parameters: { layout: "padded" },
};

/** Opens the browser print dialog in packing-label mode (same as order page). */
export const PrintDialog: Story = {
  render: () => (
    <div className="space-y-3 text-sm">
      <p className="max-w-md text-[color:var(--text-muted)]">
        {PACKING_LABEL.printHint}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => printPackingLabels()}>
        Open print dialog
      </button>
      <div className="packing-label-print-root !block">
        {sampleItems.map((item) => (
          <PackingLabel key={item.barcode} {...item} />
        ))}
      </div>
    </div>
  ),
  parameters: { layout: "padded" },
};
