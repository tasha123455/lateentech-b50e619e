import type { Product } from "../lib/types";

export function ProductsPage({ onAddProduct, onEditProduct, onOpenNotifications }: { onAddProduct: () => void; onEditProduct: (p: Product) => void; onOpenNotifications: () => void }) {
  void ( onAddProduct,  onEditProduct,  onOpenNotifications );
  return null;
}
