import { describe, expect, it } from "vitest";
import {
  extensionFromImageFile,
  validateDisputePhotoFile,
} from "@/lib/dispute-photo-shared";

describe("dispute photo helpers", () => {
  it("uses MIME type when filename has no extension", () => {
    const file = new File(["x"], "Screenshot 2026-04-19 at 17.50.19", {
      type: "image/png",
    });
    expect(extensionFromImageFile(file)).toBe("png");
  });

  it("rejects non-images", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    expect(validateDisputePhotoFile(file)).toMatch(/image/i);
  });
});
