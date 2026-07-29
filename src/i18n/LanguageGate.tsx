// Global one-time "Choose your language" gate.
//
// The very first time someone opens the site — on ANY url, not just "/" — we
// show the language chooser and hide the rest of the app until they pick.
// After that the choice is remembered (localStorage + cookie) and the gate
// never appears again.
//
// First paint is handled by an inline script in the root shell which adds the
// `lang-pending` class to <html>; CSS then hides everything except this gate,
// so no page content flashes before the choice is made.

import { useEffect, useState } from "react";
import { LanguageChooser } from "@/i18n/LanguageChooser";
import { storedLang, stripLang } from "@/i18n/langPath";

function clearPending() {
  try {
    document.documentElement.classList.remove("lang-pending");
  } catch {
    /* ignore */
  }
}

export function LanguageGate() {
  const [pending, setPending] = useState(false);
  const [suffix, setSuffix] = useState("");

  useEffect(() => {
    if (storedLang()) {
      clearPending();
      return;
    }
    setSuffix(stripLang(window.location.pathname));
    setPending(true);
  }, []);

  if (!pending) return null;

  return (
    <div className="lang-gate fixed inset-0 z-[9999] overflow-y-auto bg-background">
      <LanguageChooser
        redirectWhenStored={false}
        suffix={suffix}
        onPicked={() => {
          clearPending();
          setPending(false);
        }}
      />
    </div>
  );
}
