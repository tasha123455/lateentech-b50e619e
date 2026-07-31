import { useRef, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { useLightbox } from "./Lightbox";

/** Verify the browser can actually decode the picked file before uploading.
    Phone cameras hand us HEIC/HEIF through accept="image/*", which no browser
    can render — those used to upload "successfully" and then show up as a
    broken image in the notification. */
export async function decodableImage(file: File): Promise<boolean> {
  if (!file || !file.type || !/^image\//i.test(file.type)) return false;
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      if (bmp && bmp.close) bmp.close();
      return true;
    }
  } catch {
    /* fall through to the <img> probe */
  }
  return await new Promise<boolean>((res) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(true); };
    im.onerror = () => { URL.revokeObjectURL(url); res(false); };
    im.src = url;
  });
}

/** The add/preview/remove photo row shared by the broadcast panel, per-user
    notifications and payout receipts. */
export function PhotoPicker({
  url, onChange, idleHint = "Attach photo (optional)", attachedHint = "", verifyDecodable = true,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
  idleHint?: string;
  attachedHint?: string;
  verifyDecodable?: boolean;
}) {
  const { api } = useAdminData();
  const lightbox = useLightbox();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setHint("Uploading…");
    try {
      if (!api.uploadPhoto) throw new Error("uploader unavailable, reload the page");
      if (verifyDecodable && !(await decodableImage(file))) {
        throw new Error("unsupported image format — pick a JPG or PNG");
      }
      const uploaded = await api.uploadPhoto(file);
      onChange(uploaded);
      setHint("");
    } catch (e) {
      console.error("[admin] photo upload", e);
      setHint("Upload failed: " + ((e as Error)?.message || "try again"));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="adm-notif-photo-row">
      {!url && (
        <div className="adm-notif-photo-add" onClick={() => inputRef.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      )}
      {!!url && (
        <div className="adm-notif-photo-preview">
          <img src={url} onClick={() => lightbox.open(url)} alt="" />
          <button
            type="button"
            className="adm-notif-photo-x"
            onClick={() => { onChange(null); setHint(""); }}
          >
            ×
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <span className="adm-notif-hint">{hint || (url ? attachedHint : idleHint)}</span>
    </div>
  );
}
