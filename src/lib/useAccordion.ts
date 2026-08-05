import { useCallback, useState } from "react";

/** One open card at a time, for a list of them.
 *
 *  Cards in these lists open into several rows of detail each. Left to
 *  themselves they all stay open, and a list read top to bottom turns into a
 *  wall of text where the thing you opened three taps ago is still taking up
 *  the screen. Opening one closes the last, so the page only ever holds one
 *  card's worth of detail and the list stays a list.
 *
 *  The open card is tracked by id in the list rather than by a flag inside
 *  each card, because "only one" is a fact about the group — no card can
 *  enforce it alone, and a card holding its own flag has no way to know
 *  another was opened.
 *
 *  Tapping the open card still closes it: the toggle is a toggle, not a
 *  radio button, so there is always a way back to a list with nothing open. */
export function useAccordion<T extends string | number = string>(initial: T | null = null) {
  const [openId, setOpenId] = useState<T | null>(initial);

  const isOpen = useCallback((id: T) => openId === id, [openId]);
  const toggle = useCallback(
    (id: T) => setOpenId((cur) => (cur === id ? null : id)),
    [],
  );
  const close = useCallback(() => setOpenId(null), []);

  return { openId, isOpen, toggle, close, setOpenId };
}
