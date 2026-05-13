type Props = { size?: number };

export function LateenLogo({ size = 68 }: Props) {
  const s = size;
  const stroke = size >= 60 ? 2.5 : 2;
  return (
    <svg width={s} height={s} viewBox="0 0 68 68" fill="none" aria-hidden>
      <rect width="68" height="68" rx="18" fill="#0D0D0D" />
      <path d="M34 14 L52 54 L16 54 Z" fill="#FFFFFF" opacity="0.08" />
      <path d="M34 14 L52 54" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 14 L16 54" stroke="#FFFFFF" strokeWidth={stroke} strokeLinecap="round" />
      <path d="M16 54 L52 54" stroke="#FFFFFF" strokeWidth={stroke} strokeLinecap="round" />
      <path d="M34 14 L34 54" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 3" opacity="0.5" />
      <circle cx="34" cy="14" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}
