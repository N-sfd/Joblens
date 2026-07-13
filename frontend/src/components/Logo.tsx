interface Props {
  size?: number;
  className?: string;
}

/**
 * JobLens mark — a focused lens over a career path.
 * Brand mark only (no "AI" motif).
 */
export default function LogoMark({ size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Lens ring */}
      <circle cx="14" cy="14" r="9.5" stroke="currentColor" strokeWidth="2.2" />
      {/* Inner aperture */}
      <circle cx="14" cy="14" r="4.2" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
      {/* Focus tick */}
      <path
        d="M14 6.5V9.2M14 18.8V21.5M6.5 14H9.2M18.8 14H21.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Magnifier handle */}
      <path
        d="M20.8 20.8L27.2 27.2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Briefcase cue inside lens */}
      <rect
        x="10.2"
        y="12.2"
        width="7.6"
        height="5.2"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M12.4 12.2V11.2a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
