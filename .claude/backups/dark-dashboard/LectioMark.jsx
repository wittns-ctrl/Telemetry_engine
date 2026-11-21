import { useId } from "react";

const TONES = {
  green: ["#5cc061", "#13651f"],
  // Pink-to-violet, the accent of the dark dashboard.
  violet: ["#d77be0", "#8a62e8"],
};

// Lectio's logo: a four-pointed star, the same one as on the sign-in pages.
// It carries its own colours, so it sits on any background without a badge.
export function LectioMark({ size = 18, className = "", tone = "green" }) {
  const id = useId();
  const [from, to] = TONES[tone] || TONES.green;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M12 0C12.9 7.2 16.8 11.1 24 12 16.8 12.9 12.9 16.8 12 24 11.1 16.8 7.2 12.9 0 12 7.2 11.1 11.1 7.2 12 0Z" />
    </svg>
  );
}
