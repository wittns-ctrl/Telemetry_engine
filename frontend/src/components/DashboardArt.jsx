import React, { useId } from "react";

// Vector artwork for the dashboard: the welcome banner's backdrop and PC scene,
// and the mint backdrop behind the gauge cards.

// ------------------------------------------------------------- welcome
// The welcome banner is drawn in the reference's own pixel space (2000 × 704),
// so every point below is a coordinate measured straight off the design. The
// backdrop pins to the right and runs on past x = 0 when the banner is wider.

const fmt = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** Closed path through `pts` with each corner rounded by `r` (a number or one per corner). */
function roundPoly(pts, r) {
  const n = pts.length;
  const toward = (a, b, d) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.min(d / Math.hypot(dx, dy), 0.5);
    return [a[0] + dx * t, a[1] + dy * t];
  };
  let d = "";
  pts.forEach((p, i) => {
    const rad = Array.isArray(r) ? r[i] : r;
    const a = toward(p, pts[(i - 1 + n) % n], rad);
    const b = toward(p, pts[(i + 1) % n], rad);
    d += `${i ? "L" : "M"}${fmt(a)}Q${fmt(p)} ${fmt(b)}`;
  });
  return `${d}Z`;
}

/** The flowing glass wave along the bottom of the banner. It has no fill of its
    own: the banner is a clear pane, so the dashboard's wash shows through. */
export function WelcomeBackdrop() {
  const id = useId();
  const u = (n) => `url(#${id}${n})`;
  const crest = "M760 704C900 640 1000 498 1122 494C1250 490 1300 590 1440 632C1600 680 1800 540 2000 452";
  return (
    <svg className="lw-backdrop" viewBox="0 0 2000 704" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}hill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe3c8" />
          <stop offset="0.55" stopColor="#cfe8d6" />
          <stop offset="1" stopColor="#e2ede5" />
        </linearGradient>
        <filter id={`${id}soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="42" />
        </filter>
        <filter id={`${id}line`} x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <g filter={u("soft")}>
        <ellipse cx="1060" cy="390" rx="360" ry="80" fill="#ffffff" opacity="0.05" />
        <ellipse cx="1450" cy="560" rx="330" ry="95" fill="#5cc061" opacity="0.22" />
      </g>
      <path d={`${crest}L2000 704Z`} fill={u("hill")} opacity="0.1" />
      <g filter={u("line")}>
        <path d={crest} fill="none" stroke="#ffffff" strokeOpacity="0.32" strokeWidth="3" />
      </g>
      <path d="M-4000 704L760 704C900 640 1000 498 1122 494" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="2" />
    </svg>
  );
}

const TREES = [
  [1362, 343, 22, 34], [1376, 380, 10, 0], [1763, 380, 20, 32], [1741, 402, 9, 14],
  [1776, 408, 8, 0], [1713, 422, 14, 20], [1687, 442, 13, 18], [1605, 490, 10, 0],
];

/** PC tower, monitor and mini PC on a silver slab inside a glass tray, ringed by trees. */
export function WelcomeScene() {
  const id = useId();
  const u = (n) => `url(#${id}${n})`;

  const slab = { L: [1315, 388], F: [1598, 492], R: [1830, 418], B: [1547, 314] };
  const drop = ([x, y], h) => [x, y + h];
  const rim = [[1262, 366], [1530, 226], [1866, 372], [1598, 532]];
  const lip = [[1272, 440], [1530, 318], [1856, 446], [1588, 600]];
  const beat = [[12, 66], [34, 66], [39, 58], [44, 72], [50, 28], [58, 100], [65, 46], [70, 74], [75, 62], [112, 62]];

  return (
    <svg className="lw-scene" viewBox="1160 140 790 520" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}tray`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#c4ebcf" stopOpacity="0.5" />
          <stop offset="1" stopColor="#6fd08c" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={`${id}top`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#dfe4e1" />
          <stop offset="0.45" stopColor="#f2f4f3" />
          <stop offset="0.62" stopColor="#fafbfa" />
          <stop offset="1" stopColor="#dde3df" />
        </linearGradient>
        <linearGradient id={`${id}side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6dcd8" />
          <stop offset="1" stopColor="#a9dcb8" />
        </linearGradient>
        <linearGradient id={`${id}tl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#323635" />
          <stop offset="1" stopColor="#252827" />
        </linearGradient>
        <linearGradient id={`${id}tr`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#434746" />
          <stop offset="0.5" stopColor="#2f3332" />
          <stop offset="1" stopColor="#222524" />
        </linearGradient>
        <linearGradient id={`${id}tt`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5d6260" />
          <stop offset="1" stopColor="#4a4e4d" />
        </linearGradient>
        <radialGradient id={`${id}scr`} cx="0.45" cy="0.42" r="0.7">
          <stop offset="0" stopColor="#1a4a2d" />
          <stop offset="0.65" stopColor="#0e2216" />
          <stop offset="1" stopColor="#0a150e" />
        </radialGradient>
        <radialGradient id={`${id}leaf`} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor="#9af1aa" />
          <stop offset="0.45" stopColor="#44c464" />
          <stop offset="1" stopColor="#1f8b3c" />
        </radialGradient>
        <radialGradient id={`${id}ball`} cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#8fe39f" />
          <stop offset="0.5" stopColor="#4cc068" />
          <stop offset="1" stopColor="#2f9c4c" />
        </radialGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`${id}soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`${id}blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${id}blur2`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* glass tray: lower lip, walls and rim */}
      <path d={roundPoly(lip, 100)} fill={u("tray")} stroke="#ffffff" strokeOpacity="0.95" strokeWidth="3" />
      <path d={roundPoly([rim[0], rim[1], rim[2], lip[2], lip[3], lip[0]], [80, 100, 80, 80, 100, 80])} fill="#ffffff" fillOpacity="0.22" />
      <path d={roundPoly(rim, 100)} fill="#ffffff" fillOpacity="0.26" />

      {/* silver slab */}
      <ellipse cx="1590" cy="520" rx="250" ry="40" fill="#46c46c" opacity="0.35" filter={u("blur")} />
      <path d={roundPoly([slab.L, slab.F, slab.R, drop(slab.R, 34), drop(slab.F, 34), drop(slab.L, 34)], [16, 16, 16, 12, 16, 12])} fill={u("side")} />
      <path d={roundPoly([slab.L, slab.F, slab.R, slab.B], 18)} fill={u("top")} />
      <path d={roundPoly(rim, 100)} fill="none" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="3" />
      <path d={roundPoly(lip.map(([x, y]) => [x, y - 14]), 100)} fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.5" />

      {/* shadows and green light on the slab */}
      <polygon points="1468,397 1558,350 1622,376 1530,424" fill="#1c2b22" opacity="0.18" filter={u("blur")} />
      <polygon points="1588,466 1628,450 1664,466 1622,484" fill="#1c2b22" opacity="0.2" filter={u("blur")} />
      <ellipse cx="1436" cy="404" rx="34" ry="12" fill="#45e07c" opacity="0.55" filter={u("blur")} />
      <ellipse cx="1572" cy="470" rx="22" ry="8" fill="#45e07c" opacity="0.45" filter={u("blur")} />

      {/* PC tower */}
      <path d={roundPoly([[1468, 237], [1558, 190], [1558, 350], [1468, 397]], [6, 12, 6, 6])} fill={u("tr")} />
      <path d={roundPoly([[1412, 215], [1468, 237], [1468, 397], [1412, 375]], [12, 6, 6, 10])} fill={u("tl")} />
      <path d={roundPoly([[1412, 215], [1505, 168], [1558, 190], [1468, 237]], [12, 12, 12, 6])} fill={u("tt")} />
      <line x1="1468" y1="240" x2="1468" y2="394" stroke="#7d8783" strokeWidth="2" />
      <line x1="1413" y1="222" x2="1413" y2="370" stroke="#9af5bb" strokeOpacity="0.7" strokeWidth="2" filter={u("soft")} />
      <g transform="matrix(1 0.393 0 1 1412 215)">
        <rect x="6" y="9" width="44" height="146" rx="8" fill="#1f2221" stroke="#7ef0a4" strokeOpacity="0.55" strokeWidth="1.6" filter={u("soft")} />
        <g fill="none" stroke="#5cee90" strokeWidth="2.2" strokeLinecap="round" filter={u("soft")}>
          <path d="M22.5 25.5A10 10 0 1 0 33.5 25.5" />
          <line x1="28" y1="21" x2="28" y2="32" />
          <circle cx="28" cy="78" r="10" />
          <line x1="28" y1="63" x2="28" y2="93" />
          <path d="M33 117A10 10 0 1 1 24 116" />
        </g>
        <rect x="9" y="146" width="38" height="5" rx="2.5" fill="#46e07d" opacity="0.45" filter={u("blur2")} />
      </g>

      {/* monitor */}
      <polygon points="1642,352 1660,358 1660,406 1642,400" fill="#2b2f2e" />
      <polygon points="1660,358 1668,355 1668,403 1660,406" fill="#1c1f1e" />
      <path d={roundPoly([[1618, 404], [1660, 390], [1704, 406], [1662, 421]], 8)} fill="#3b3f3e" />
      <path d="M1618 404L1662 421L1704 406L1704 411L1662 426L1618 409Z" fill="#1c1f1e" />
      <polygon points="1580,198 1588,193 1730,242 1722,247" fill="#4a4f4d" />
      <polygon points="1722,247 1730,242 1730,377 1722,382" fill="#1f2221" />
      <path d={roundPoly([[1580, 198], [1722, 247], [1722, 382], [1580, 338]], 6)} fill="#262a29" />
      <g transform="matrix(1 0.345 0 1 1580 198)">
        <rect x="7" y="7" width="128" height="126" rx="3" fill={u("scr")} />
        <polyline
          points={beat.map((p) => p.join(",")).join(" ")}
          fill="none" stroke="#4fe887" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" filter={u("glow")}
        />
      </g>

      {/* mini PC */}
      <path d={roundPoly([[1588, 386], [1628, 370], [1628, 450], [1588, 466]], [4, 8, 6, 4])} fill="#1f2221" />
      <path d={roundPoly([[1555, 372], [1588, 386], [1588, 466], [1555, 452]], [8, 4, 4, 6])} fill="#2c302f" />
      <path d={roundPoly([[1555, 372], [1595, 357], [1628, 370], [1588, 386]], [8, 8, 8, 4])} fill="#585d5b" />
      <line x1="1588" y1="388" x2="1588" y2="464" stroke="#6f7975" strokeWidth="1.5" />
      <g transform="matrix(1 0.424 0 1 1555 372)">
        <rect x="5" y="9" width="23" height="62" rx="4" fill="none" stroke="#3d4341" strokeWidth="1.5" />
        <g fill="#4be382" filter={u("glow")}>
          <rect x="9" y="18" width="2.5" height="7" rx="1" />
          <rect x="9" y="31" width="2.5" height="5" rx="1" />
          <rect x="9" y="42" width="2.5" height="5" rx="1" />
          <rect x="9" y="54" width="2.5" height="5" rx="1" />
          <rect x="15" y="20" width="2.5" height="3" rx="1" />
        </g>
      </g>

      {/* trees */}
      {TREES.map(([cx, cy, r, trunk]) => (
        <g key={`${cx}-${cy}`}>
          <ellipse cx={cx + r * 0.3} cy={cy + (trunk || r) + 4} rx={r * 0.8} ry={r * 0.28} fill="#1c3a26" opacity="0.18" filter={u("blur2")} />
          {trunk > 0 && <line x1={cx} y1={cy + r * 0.5} x2={cx} y2={cy + trunk} stroke="#4a3b2c" strokeWidth={Math.max(2.5, r * 0.18)} strokeLinecap="round" />}
          <circle cx={cx} cy={cy} r={r} fill={u("leaf")} />
        </g>
      ))}

      {/* floating sphere */}
      <ellipse cx="1905" cy="642" rx="26" ry="5" fill="#2e8a4b" opacity="0.2" filter={u("blur2")} />
      <circle cx="1905" cy="577" r="37" fill={u("ball")} />
    </svg>
  );
}

/** Mint backdrop behind the gauge cards, with soft light waves on the right. */
export function GaugesBackdrop() {
  const id = useId();
  return (
    <svg className="lg-backdrop" viewBox="0 0 484 474" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3f4e9" />
          <stop offset="1" stopColor="#d6eddf" />
        </linearGradient>
        <filter id={`${id}b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width="484" height="474" fill="#d3ebdc" />
      <g filter={`url(#${id}b)`}>
        <path d="M300 160C360 150 430 120 484 70V0H484C470 60 400 120 300 160Z" fill="#e2f3e8" />
        <path d="M200 474C250 380 340 300 484 250V474Z" fill={`url(#${id}w)`} />
        <path d="M300 474C350 410 410 370 484 350V474Z" fill="#e6f5eb" />
      </g>
      <path d="M200 474C250 380 340 300 484 250" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" />
      <path d="M300 474C350 410 410 370 484 350" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1" />
    </svg>
  );
}
