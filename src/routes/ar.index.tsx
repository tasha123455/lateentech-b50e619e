import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/pages/Landing";

export const Route = createFileRoute("/ar/")({
  head: () => ({
    meta: [
      { title: "وصلة — رابطك الأذكى للتجارة الحديثة" },
      { name: "description", content: "وصلة تربط الشركات بالمسوّقين. ادفع فقط عند البيع." },
    ],
  }),
  component: Landing,
});
