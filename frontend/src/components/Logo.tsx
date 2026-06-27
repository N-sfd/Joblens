interface Props {
  size?: number;
  className?: string;
}

/** JobLens mark — a briefcase viewed through a lens. */
export default function LogoMark({ size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="9" width="10" height="8" rx="1.5" />
      <path d="M5.5 9V7a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 10.5 7v2" />
      <line x1="2" y1="12.5" x2="12" y2="12.5" />
      <circle cx="15.6" cy="9.4" r="5.1" />
      <line x1="19.2" y1="13" x2="22" y2="15.8" />
    </svg>
  );
}
