export const DISPUTE_PHOTO_MAX_BYTES = 2_500_000;
export const DISPUTE_UPLOAD_REL = ".data/dispute-photos";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function extensionFromImageFile(file: File): string {
  const fromMime = MIME_TO_EXT[file.type.toLowerCase()];
  if (fromMime) return fromMime;
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  if (m?.[1]) return m[1].toLowerCase();
  return "jpg";
}

export function validateDisputePhotoFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Please upload an image file (PNG, JPEG, WebP, or GIF).";
  }
  if (file.size > DISPUTE_PHOTO_MAX_BYTES) {
    return "Photo must be under 2.5 MB.";
  }
  if (file.size === 0) {
    return "That file is empty. Choose another image.";
  }
  return null;
}
