import { createFileRoute } from "@tanstack/react-router";
import { PublicProduct } from "@/pages/PublicProduct";

export const Route = createFileRoute("/ar/p/$id")({
  head: () => ({
    meta: [
      { title: "المنتج · وصلة" },
      { name: "description", content: "شاهد هذا المنتج على وصلة." },
      { property: "og:title", content: "المنتج · وصلة" },
      { property: "og:description", content: "شاهد هذا المنتج على وصلة." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArProduct,
});

function ArProduct() {
  const { id } = Route.useParams();
  return <PublicProduct id={id} />;
}
