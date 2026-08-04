import { useEffect } from "react";

/** How many sheets currently want the page still.
 *
 *  A count rather than a flag, because sheets stack: the product sheet opens a
 *  photo viewer over itself, and when the viewer closes it must not hand the
 *  page back while the sheet underneath is still open. The last one out
 *  restores scrolling. */
let held = 0;

/** Holds the page still while a sheet is open.
 *
 *  A sheet that covers the screen but leaves the page behind it scrollable is
 *  a strange thing to use: a drag meant for the sheet moves the page under it,
 *  and closing the sheet leaves you somewhere you did not choose to be. Most
 *  of the overlays did this already, one copy each; the ones that did not were
 *  the ones nobody had noticed — including the add-product page.
 *
 *  Both <html> and <body> are set, because which of the two scrolls differs
 *  between iOS Safari and everything else, and setting one is a fix that works
 *  on the device you happened to test on. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    held += 1;
    if (held === 1) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      held = Math.max(0, held - 1);
      if (held === 0) {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
      }
    };
  }, [active]);
}
