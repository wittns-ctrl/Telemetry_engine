import React, { useId } from "react";

// Vector artwork for the dashboard, drawn in Lectio's palette: an isometric PC
// setup for the hero, a floating-island PC for Device Health and a motherboard
// heat map for the Thermal Map card.

const C30 = Math.cos(Math.PI / 6);

function iso(ox, oy, s) {
  const P = (x, y, z) => [ox + (x - y) * C30 * s, oy + (x + y) * 0.5 * s - z * s];
  const pts = (list) => list.map((p) => P(...p).map((v) => v.toFixed(2)).join(",")).join(" ");
  /** Box from (x, y, z) sized w × d × h: top, front-left (max y) and front-right (max x) faces. */
  const box = (x, y, z, w, d, h) => ({
    top: pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]),
    left: pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]),
    right: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]),
  });
  /** SVG transform drawing in a face's own units: u along x (left face) or y (right face), v up. */
  const leftFace = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(${C30 * s} ${0.5 * s} 0 ${-s} ${a} ${b})`; };
  const rightFace = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(${-C30 * s} ${0.5 * s} 0 ${-s} ${a} ${b})`; };
  return { P, pts, box, leftFace, rightFace };
}

function Box({ b, top, left, right }) {
  return (
    <g>
      <polygon points={b.left} fill={left} />
      <polygon points={b.right} fill={right} />
      <polygon points={b.top} fill={top} />
    </g>
  );
}

function Bush({ cx, cy, r, fill }) {
  return (
    <g>
      <circle cx={cx - r * 0.45} cy={cy + r * 0.12} r={r * 0.68} fill={fill} />
      <circle cx={cx + r * 0.48} cy={cy + r * 0.16} r={r * 0.64} fill={fill} />
      <circle cx={cx + r * 0.02} cy={cy - r * 0.32} r={r * 0.76} fill={fill} />
    </g>
  );
}

function bushesAlong(P, edge, from, to, step, z, size) {
  const out = [];
  for (let t = from; t <= to + 0.001; t += step) {
    const [cx, cy] = edge === "y" ? P(t, 10, z) : edge === "x" ? P(10, t, z) : edge === "y0" ? P(t, 0, z) : P(0, t, z);
    out.push({ cx, cy, r: size * (0.78 + ((Math.round(t * 10) * 37) % 9) * 0.05) });
  }
  return out;
}

const SLATE = { top: "#45454c", left: "#2a2a2f", right: "#1c1c1f" };

function Tower({ g, x, y, z, w, d, h, glow }) {
  const b = g.box(x, y, z, w, d, h);
  const fans = [0.24, 0.5, 0.76].map((t) => z + 0 + h * t);
  return (
    <g>
      <Box b={b} {...SLATE} />
      {/* tempered-glass side with three lit fans */}
      <g transform={g.leftFace(x, y + d, z)}>
        <rect x={w * 0.07} y={h * 0.04} width={w * 0.86} height={h * 0.92} rx="0.12" fill="#26262b" />
        {fans.map((fz) => (
          <g key={fz}>
            <circle cx={w / 2} cy={fz - z} r={w * 0.27} fill={glow} opacity="0.22" />
            <circle cx={w / 2} cy={fz - z} r={w * 0.27} fill="none" stroke="#5cc061" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            <circle cx={w / 2} cy={fz - z} r={w * 0.08} fill="#1c1c1f" />
          </g>
        ))}
      </g>
      {/* vents and power button on the front */}
      <g transform={g.rightFace(x + w, y + d, z)}>
        {[0.62, 0.7, 0.78].map((v) => (
          <line key={v} x1={d * 0.25} x2={d * 0.75} y1={h * v} y2={h * v} stroke="#45454c" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <circle cx={d * 0.5} cy={h * 0.9} r={d * 0.05} fill="#5cc061" />
      </g>
    </g>
  );
}

/** Hero: a PC setup on a grassy slab, ringed with bushes like the reference's diorama. */
export function HeroScene() {
  const id = useId();
  const g = iso(116, 96, 11);
  const { P, box } = g;
  const slab = box(0, 0, -1.3, 10, 10, 1.3);
  const deck = box(0.9, 0.9, 0, 8.2, 8.2, 0.25);
  const rack = box(7.6, 5.4, 0.25, 1.5, 2.2, 4.2);
  const stand = box(5.2, 2.0, 0.25, 1.2, 0.8, 0.2);
  const neck = box(5.7, 2.2, 0.45, 0.22, 0.22, 1.6);
  const screen = box(3.6, 1.9, 2.05, 5.0, 0.3, 3.3);
  const keyboard = box(4.4, 4.1, 0.25, 3.1, 1.1, 0.14);
  const mouse = box(7.9, 4.3, 0.25, 0.4, 0.6, 0.14);
  const fill = `url(#${id}b)`;

  const back = [...bushesAlong(P, "y0", 3.6, 9.4, 1.2, 0.3, 7.5), ...bushesAlong(P, "x0", 4.2, 9.4, 1.2, 0.3, 7.5)];
  const front = [...bushesAlong(P, "y", 0.4, 9.6, 1.0, 0.15, 8.5), ...bushesAlong(P, "x", 0.4, 9.2, 1.0, 0.15, 8.5)];
  const chart = [[0.35, 1.0], [0.9, 1.5], [1.45, 1.25], [2.0, 2.0], [2.55, 1.7], [3.1, 2.4], [3.65, 1.95], [4.2, 2.6], [4.7, 2.25]];

  return (
    <svg viewBox="0 0 232 226" role="img" aria-label="Illustration of a desktop PC with a monitor and a server, surrounded by plants">
      <defs>
        <radialGradient id={`${id}b`} cx="0.4" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#9ad99c" />
          <stop offset="0.38" stopColor="#5cc061" />
          <stop offset="0.78" stopColor="#1c7a2e" />
          <stop offset="1" stopColor="#14511c" />
        </radialGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eaf5ec" />
          <stop offset="1" stopColor="#b5dfbe" />
        </linearGradient>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0e0e10" floodOpacity="0.18" />
        </filter>
      </defs>

      <g filter={`url(#${id}s)`}>
        <Box b={slab} top={`url(#${id}g)`} left="#c9cbc7" right="#aeb1ad" />
      </g>
      {back.map((b, i) => <Bush key={`b${i}`} {...b} fill={fill} />)}
      <Box b={deck} top="#f4f4f2" left="#d9d9d5" right="#c6c6c2" />

      {/* monitor with a live temperature chart */}
      <Box b={stand} {...SLATE} />
      <Box b={neck} {...SLATE} />
      <Box b={screen} {...SLATE} />
      <g transform={g.leftFace(3.6, 2.2, 2.05)}>
        <rect x="0.14" y="0.14" width="4.72" height="3.02" rx="0.08" fill="#0e0e10" />
        <polyline
          points={chart.map(([u, v]) => `${u},${v}`).join(" ")}
          fill="none" stroke="#5cc061" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
        <line x1="0.3" x2="4.7" y1="2.75" y2="2.75" stroke="#ec003f" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        {[0.5, 0.9, 1.3, 1.7].map((u, i) => (
          <rect key={u} x={u} y="0.35" width="0.25" height={0.25 + i * 0.12} fill="#45454c" />
        ))}
      </g>

      <Tower g={g} x={1.5} y={4.6} z={0.25} w={2.4} d={3.6} h={6.0} glow="#5cc061" />

      <Box b={keyboard} top="#f5f5f6" left="#cfcfcb" right="#b9b9bf" />
      <Box b={mouse} top="#f5f5f6" left="#cfcfcb" right="#b9b9bf" />

      {/* home server */}
      <Box b={rack} {...SLATE} />
      <g transform={g.leftFace(7.6, 7.6, 0.25)}>
        {[3.4, 2.8, 2.2, 1.6, 1.0].map((v) => (
          <g key={v}>
            <rect x="0.12" y={v} width="1.26" height="0.35" rx="0.06" fill="#26262b" />
            <rect x="1.05" y={v + 0.12} width="0.2" height="0.11" fill="#5cc061" />
          </g>
        ))}
      </g>

      {front.map((b, i) => <Bush key={`f${i}`} {...b} fill={fill} />)}
    </svg>
  );
}

/** Device Health: one PC on a floating island, with leader lines for the labels. */
export function HealthScene() {
  const id = useId();
  const g = iso(75, 18, 5.2);
  const { P, box } = g;
  const slab = box(0, 0, -0.9, 10, 10, 0.9);
  const fill = `url(#${id}b)`;
  const back = [...bushesAlong(P, "y0", 4, 9.2, 1.5, 0.3, 4.2), ...bushesAlong(P, "x0", 4, 9.2, 1.5, 0.3, 4.2)];
  const front = [...bushesAlong(P, "y", 0.6, 9.4, 1.25, 0.15, 4.6), ...bushesAlong(P, "x", 0.6, 9, 1.25, 0.15, 4.6)];
  const pt = (x, y, z) => P(x, y, z).map((v) => v.toFixed(1)).join(",");

  return (
    <svg viewBox="0 0 150 108" role="img" aria-label="Illustration of a PC on a floating island">
      <defs>
        <radialGradient id={`${id}b`} cx="0.4" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#9ad99c" />
          <stop offset="0.38" stopColor="#5cc061" />
          <stop offset="0.78" stopColor="#1c7a2e" />
          <stop offset="1" stopColor="#14511c" />
        </radialGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9b9bf" />
          <stop offset="1" stopColor="#8e8e96" />
        </linearGradient>
      </defs>
      {/* rocky underside */}
      <polygon points={`${pt(0, 10, -0.9)} ${pt(10, 10, -0.9)} ${pt(7.5, 7.5, -7)}`} fill={`url(#${id}r)`} />
      <polygon points={`${pt(10, 10, -0.9)} ${pt(10, 0, -0.9)} ${pt(7.5, 7.5, -7)}`} fill="#8e8e96" />
      <Box b={slab} top="#dcefe0" left="#c9cbc7" right="#aeb1ad" />
      {back.map((b, i) => <Bush key={`b${i}`} {...b} fill={fill} />)}
      <Tower g={g} x={3.4} y={3.2} z={0} w={2.6} d={3.9} h={6.0} glow="#5cc061" />
      {front.map((b, i) => <Bush key={`f${i}`} {...b} fill={fill} />)}

      {/* leader lines to the CPU, GPU and Power Supply tags */}
      {[
        { at: P(4.7, 7.1, 4.9), path: (a) => `${a[0]},${a[1]} 40,${a[1]} 40,16` },
        { at: P(6.0, 5.4, 3.0), path: (a) => `${a[0]},${a[1]} 128,${a[1]} 128,58` },
        { at: P(4.1, 7.1, 1.0), path: (a) => `${a[0]},${a[1]} 22,${a[1]} 22,74` },
      ].map(({ at, path }, i) => (
        <g key={i}>
          <polyline points={path(at.map((v) => +v.toFixed(1)))} fill="none" stroke="#45454c" strokeWidth="0.6" />
          <circle cx={at[0]} cy={at[1]} r="1.3" fill="#fff" stroke="#1c1c1f" strokeWidth="0.6" />
        </g>
      ))}
    </svg>
  );
}

/** Thermal map: a motherboard seen from above, with the hot parts lit green. */
export function ThermalBoard({ hot = ["cpu", "gpu"] }) {
  const dark = "rgba(28, 28, 31, 0.55)";
  const lit = (key) => (hot.includes(key) ? "#5cc061" : dark);
  return (
    <svg viewBox="0 0 148 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* rear I/O and VRM heatsinks */}
      <rect x="8" y="10" width="22" height="42" rx="4" fill={dark} />
      <rect x="36" y="8" width="44" height="9" rx="3" fill={dark} />
      <rect x="36" y="20" width="9" height="34" rx="3" fill={dark} />
      {/* CPU socket */}
      <rect x="50" y="22" width="32" height="32" rx="5" fill={lit("cpu")} />
      <rect x="58" y="30" width="16" height="16" rx="3" fill="rgba(255,255,255,0.25)" />
      {/* RAM */}
      {[90, 97, 104, 111].map((x, i) => (
        <rect key={x} x={x} y="10" width="4.5" height="48" rx="2" fill={hot.includes("ram") && i < 2 ? "#5cc061" : dark} />
      ))}
      {/* power connector */}
      <rect x="124" y="16" width="10" height="30" rx="3" fill={lit("psu")} />
      {/* M.2 drive */}
      <rect x="14" y="60" width="34" height="7" rx="3" fill={lit("ssd")} />
      {/* graphics card */}
      <rect x="10" y="74" width="104" height="18" rx="5" fill={lit("gpu")} />
      <circle cx="40" cy="83" r="6" fill="rgba(255,255,255,0.22)" />
      <circle cx="78" cy="83" r="6" fill="rgba(255,255,255,0.22)" />
      {/* chipset and spare slot */}
      <rect x="118" y="66" width="20" height="20" rx="4" fill={lit("chipset")} />
      <rect x="10" y="100" width="104" height="6" rx="3" fill={dark} />
      <rect x="120" y="94" width="18" height="18" rx="4" fill={dark} />
      {/* marker on the hottest part */}
      <line x1="66" y1="38" x2="66" y2="58" stroke="#fff" strokeWidth="0.8" strokeDasharray="2 1.5" />
      <circle cx="66" cy="38" r="2.2" fill="#fff" />
    </svg>
  );
}
