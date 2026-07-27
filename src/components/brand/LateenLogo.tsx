// Wasla brand mark. Component name kept as `LateenLogo` to avoid churning
// the many import sites across the codebase — the visual is the Wasla mark.
type Props = { size?: number };

export function LateenLogo({ size = 68 }: Props) {
  return (
    <img
      src="/wasla-mark-192.png"
      width={size}
      height={size}
      alt="Wasla"
      style={{ display: "block", borderRadius: size >= 40 ? 14 : 8 }}
    />
  );
}
