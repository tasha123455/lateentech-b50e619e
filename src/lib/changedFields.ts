/** The details an admin can change on somebody's behalf.
 *
 *  Named in one place because three screens have to agree on them: the tick
 *  boxes the person uses to ask, the pills on the admin's card, and the
 *  notification that tells them it is done. */
export type ChangeField = "email" | "phone" | "country";

const NAMES: Record<string, { en: string; ar: string }> = {
  email: { en: "email", ar: "البريد الإلكتروني" },
  phone: { en: "phone number", ar: "رقم الهاتف" },
  country: { en: "country", ar: "الدولة" },
};

/** "email and phone number" · "البريد الإلكتروني ورقم الهاتف"
 *
 *  Joined the way each language joins a list: commas and a final "and" in
 *  English, and in Arabic a واو stuck to the front of each following item
 *  rather than a separate word. */
export function fieldsPhrase(fields: unknown, ar: boolean): string {
  const list = (Array.isArray(fields) ? fields : [])
    .map((f) => NAMES[String(f)])
    .filter(Boolean)
    .map((n) => (ar ? n.ar : n.en));
  if (!list.length) return ar ? "بياناتك" : "your details";
  if (ar) return list.reduce((acc, n, i) => (i === 0 ? n : acc + " و" + n), "");
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
}

/** The whole line: "Your email and phone number were updated" ·
 *  "تم تغيير البريد الإلكتروني ورقم الهاتف". */
export function changedTitle(fields: unknown, ar: boolean): string {
  const n = countOf(fields);
  // Nothing recognisable to name — an older notification, or a field added
  // after this was written. Say the plain thing rather than "Your your details".
  if (!n) return ar ? "تم تغيير بياناتك" : "Your details were updated";
  const phrase = fieldsPhrase(fields, ar);
  return ar ? "تم تغيير " + phrase : "Your " + phrase + (n === 1 ? " was" : " were") + " updated";
}

const countOf = (fields: unknown) =>
  (Array.isArray(fields) ? fields : []).filter((f) => NAMES[String(f)]).length;
