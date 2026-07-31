import { useState } from "react";

import { firstChar } from "../lib/format";

/** Avatar image with an initials fallback, used in the topbar, menu and profile. */
export function Avatar({
  url, name, className, id, style, onClick,
}: {
  url?: string | null;
  name?: string | null;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const initials = firstChar(name) || "··";
  const showImg = !!url && !broken;
  return (
    <div
      id={id}
      className={className}
      style={style}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {showImg ? (
        <img
          src={url as string}
          alt=""
          decoding="async"
          loading="eager"
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", borderRadius: "inherit" }}
        />
      ) : (
        initials
      )}
    </div>
  );
}
