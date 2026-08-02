import { useState } from "react";

import { downloadPhoto } from "@/lib/photoDownload";

/** The save button in the corner of a fullscreen photo.
 *
 *  Styled inline rather than from a stylesheet because it sits inside three
 *  different viewers — the marketer's, the business's and the admin's — each
 *  with its own CSS scope, and the button should look the same in all of them.
 *
 *  It reports back: a tick while the file is on its way, so a share sheet that
 *  takes a moment to appear does not read as a dead button. */
export function PhotoDownloadButton({ url, style }: { url: string; style?: React.CSSProperties }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === "busy") return;
    setState("busy");
    try {
      const r = await downloadPhoto(url);
      setState(r === "cancelled" ? "idle" : "done");
      if (r !== "cancelled") setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
    }
  };

  return (
    <button
      type="button"
      aria-label="Save photo"
      title="Save photo"
      onClick={(e) => void save(e)}
      style={{
        position: "absolute",
        top: "calc(14px + env(safe-area-inset-top,0px))",
        insetInlineEnd: 72,
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,.55)",
        background: "rgba(0,0,0,.62)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 2147483000,
        boxShadow: "0 4px 16px rgba(0,0,0,.6)",
        padding: 0,
        ...style,
      }}
    >
      {state === "done" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={state === "busy" ? { opacity: 0.5 } : undefined}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
    </button>
  );
}
