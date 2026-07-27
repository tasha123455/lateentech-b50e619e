import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/pages/Landing";

export const Route = createFileRoute("/en/")({
  head: () => ({
    meta: [
      { title: "Wasla — Your smartest link to modern commerce" },
      { name: "description", content: "Wasla connects businesses with marketers. Pay only when you sell." },
    ],
  }),
  component: Landing,
});
