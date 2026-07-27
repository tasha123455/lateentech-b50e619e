import { createFileRoute } from "@tanstack/react-router";
import { PublicProduct } from "@/pages/PublicProduct";

export const Route = createFileRoute("/en/p/$id")({
  head: () => ({
    meta: [
      { title: "Product · Wasla" },
      { name: "description", content: "View this product on Wasla." },
      { property: "og:title", content: "Product · Wasla" },
      { property: "og:description", content: "View this product on Wasla." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnProduct,
});

function EnProduct() {
  const { id } = Route.useParams();
  return <PublicProduct id={id} />;
}
