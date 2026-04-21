export function Logomark({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="2"
        width="22"
        height="28"
        rx="5"
        className="fill-primary/15 stroke-primary"
        strokeWidth="1.5"
      />
      <path
        d="M10 20 C 12 14, 15 14, 17 20 S 22 28, 24 18"
        className="stroke-primary"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="23" cy="10" r="3" className="fill-success" />
    </svg>
  );
}
