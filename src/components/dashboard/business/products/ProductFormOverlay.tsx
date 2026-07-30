import type { Product } from "../lib/types";

export function ProductFormOverlay({ open, editing, onClose }: { open: boolean; editing: Product | null; onClose: () => void }) {
  void ( open,  editing,  onClose );
  return null;
}
