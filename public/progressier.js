// Keep the Progressier install manifest/script, but do not let Progressier
// handle push notifications. Its default push handler can show a generic
// Chrome-branded notification. Wasla handles push from /sw.js instead.
importScripts("/sw.js");
