import { createFileRoute } from "@tanstack/react-router";

// Public by design — a VAPID public key is meant to be handed to browsers.
// It cannot be used to send push messages (that needs the private key), only to verify
// that a message claiming to be from us really is.
export const Route = createFileRoute("/api/public/notifications/vapid-public-key")({
  server: {
    handlers: {
      GET: async () => {
        const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
        return new Response(JSON.stringify({ publicKey }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
