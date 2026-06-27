interface Props {
  size?: number;
  className?: string;
}

/** Briefcase-through-a-lens illustration for empty job/application states. */
export function EmptyJobsIllustration({ size = 96, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill="#EEF2FF" />
      <g stroke="#A5B4FC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="#fff">
        <rect x="28" y="42" width="32" height="24" rx="3" />
        <path d="M36 42v-6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6" />
        <line x1="28" y1="52" x2="60" y2="52" stroke="#A5B4FC" />
      </g>
      <circle cx="64" cy="38" r="11" fill="#fff" stroke="#6366F1" strokeWidth="2.4" />
      <line x1="71.8" y1="45.8" x2="78" y2="52" stroke="#6366F1" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="26" r="2" fill="#C7D2FE" />
      <circle cx="76" cy="22" r="1.6" fill="#C7D2FE" />
      <circle cx="18" cy="68" r="1.6" fill="#C7D2FE" />
    </svg>
  );
}

/** Bot + sparkle illustration for empty AI activity states. */
export function EmptyActivityIllustration({ size = 96, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill="#EEF2FF" />
      <g stroke="#A5B4FC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="#fff">
        <rect x="30" y="34" width="36" height="28" rx="6" />
        <line x1="48" y1="34" x2="48" y2="26" />
        <circle cx="48" cy="23" r="2.4" fill="#A5B4FC" stroke="none" />
        <circle cx="40" cy="48" r="2.6" fill="#6366F1" stroke="none" />
        <circle cx="56" cy="48" r="2.6" fill="#6366F1" stroke="none" />
        <path d="M40 56h16" />
      </g>
      <path d="M74 28l1.8 4.2L80 34l-4.2 1.8L74 40l-1.8-4.2L68 34l4.2-1.8z" fill="#C7D2FE" />
      <circle cx="20" cy="64" r="1.8" fill="#C7D2FE" />
      <circle cx="22" cy="30" r="1.6" fill="#C7D2FE" />
    </svg>
  );
}
