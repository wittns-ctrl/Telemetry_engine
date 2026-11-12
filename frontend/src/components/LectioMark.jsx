// Lectio's logo: an "L" whose foot turns into a single sensor reading.
// Drawn with currentColor so the badge around it decides the colours.
export function LectioMark({ size = 18, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 4v14h4l2.2-5 2.3 5H18" />
    </svg>
  );
}
