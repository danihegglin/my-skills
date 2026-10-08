export default function Logo({ onClick, compact }: { onClick?: () => void; compact?: boolean }) {
  return (
    <a
      href="/"
      onClick={(e) => {
        if (!onClick) return;
        e.preventDefault();
        onClick();
      }}
      className="group inline-flex shrink-0 items-center gap-2 font-display text-[22px] font-bold tracking-tight text-ink"
      aria-label="PropLens home"
    >
      <svg viewBox="0 0 32 32" className="size-8 transition-transform duration-300 group-hover:-rotate-12" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#10140f" />
        <circle cx="15" cy="15" r="7.5" fill="none" stroke="#d4f26a" strokeWidth="3" />
        <circle cx="15" cy="15" r="2.6" fill="#d4f26a" />
        <path d="M20.5 20.5 25 25" stroke="#d4f26a" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className={compact ? "hidden sm:inline" : undefined}>proplens</span>
    </a>
  );
}
