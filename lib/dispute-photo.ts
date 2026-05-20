import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  DISPUTE_UPLOAD_REL,
  extensionFromImageFile,
  validateDisputePhotoFile,
} from "@/lib/dispute-photo-shared";

export { DISPUTE_PHOTO_MAX_BYTES, DISPUTE_UPLOAD_REL } from "@/lib/dispute-photo-shared";

/** Writes `{disputeId}.{ext}` under `.data/dispute-photos`. Returns stored filename. */
export async function saveDisputePhoto(
  disputeId: string,
  file: File,
): Promise<string> {
  const err = validateDisputePhotoFile(file);
  if (err) throw new Error(err);

  const absDir = join(process.cwd(), DISPUTE_UPLOAD_REL);
  await mkdir(absDir, { recursive: true });
  const ext = extensionFromImageFile(file);
  const fname = `${disputeId}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(absDir, fname), buf);
  return fname;
}

export function newDisputeId(): string {
  return randomUUID();
}
