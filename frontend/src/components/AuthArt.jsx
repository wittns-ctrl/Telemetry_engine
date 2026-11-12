import React from "react";

// Left half of the auth pages, drawn as SVG and live text so it stays sharp at
// any size. Each scene is laid out in the pixel space of the original picture
// it replaces (w × h), and that box is scaled to fit the panel (see auth.css).

// ── Shared pieces ────────────────────────────────────────────────────────────
function Defs() {
  return (
    <defs>
      <radialGradient id="aa-sphere" cx="0.26" cy="0.74" r="0.95">
        <stop offset="0" stopColor="#e9f8d9" />
        <stop offset="0.28" stopColor="#97d184" />
        <stop offset="0.66" stopColor="#2c8b38" />
        <stop offset="1" stopColor="#14601f" />
      </radialGradient>
      <radialGradient id="aa-disc" cx="0.42" cy="0.38" r="0.62">
        <stop offset="0.6" stopColor="#fcfcfd" />
        <stop offset="1" stopColor="#f5f8f7" />
      </radialGradient>
      <radialGradient id="aa-haze">
        <stop offset="0" stopColor="#cbe4d3" stopOpacity="0.9" />
        <stop offset="1" stopColor="#cbe4d3" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="aa-band" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7fc296" />
        <stop offset="1" stopColor="#d6ebdc" stopOpacity="0.4" />
      </linearGradient>
      <linearGradient id="aa-dark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6cc874" />
        <stop offset="0.55" stopColor="#21842f" />
        <stop offset="1" stopColor="#0b5418" />
      </linearGradient>
      <linearGradient id="aa-pale" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e4f3e6" />
        <stop offset="1" stopColor="#9fd2a8" />
      </linearGradient>
      <linearGradient id="aa-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
        <stop offset="1" stopColor="#dcece0" stopOpacity="0.45" />
      </linearGradient>
      <linearGradient id="aa-orbit" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2f9a45" stopOpacity="0.15" />
        <stop offset="0.35" stopColor="#2f9a45" />
        <stop offset="1" stopColor="#2f9a45" stopOpacity="0.6" />
      </linearGradient>
      <linearGradient id="aa-cube-l" x1="0" y1="0" x2="1" y2="0.4">
        <stop offset="0" stopColor="#f3faf4" />
        <stop offset="1" stopColor="#bfe2c7" />
      </linearGradient>
      <linearGradient id="aa-cube-r" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6cc18a" />
        <stop offset="1" stopColor="#9ed6b0" />
      </linearGradient>
      <linearGradient id="aa-star" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5cc061" />
        <stop offset="1" stopColor="#13651f" />
      </linearGradient>
      <filter id="aa-blur-s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8" /></filter>
      <filter id="aa-blur-m" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      <filter id="aa-blur-l" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
    </defs>
  );
}

function Sphere({ cx, cy, r, blur }) {
  return (
    <g filter={blur ? "url(#aa-blur-s)" : undefined}>
      <ellipse cx={cx + r * 0.25} cy={cy + r * 1.25} rx={r * 0.9} ry={r * 0.3} fill="#9cc7a6" opacity="0.35" filter="url(#aa-blur-m)" />
      <circle cx={cx} cy={cy} r={r} fill="url(#aa-sphere)" />
      <ellipse cx={cx - r * 0.15} cy={cy - r * 0.55} rx={r * 0.32} ry={r * 0.14} fill="#fff" opacity="0.18" filter="url(#aa-blur-s)" />
    </g>
  );
}

// Soft backdrop: a big pale disc, green haze on the right and a green swoosh bottom-left.
function Backdrop({ w, h, disc, band, carve }) {
  return (
    <g>
      <circle cx={w * 1.02} cy={h * 0.42} r={w * 0.55} fill="url(#aa-haze)" />
      <circle cx={disc[0] + 4} cy={disc[1] + 4} r={disc[2]} fill="#dcebe1" opacity="0.8" filter="url(#aa-blur-l)" />
      <circle cx={disc[0]} cy={disc[1]} r={disc[2]} fill="url(#aa-disc)" filter="url(#aa-blur-s)" />
      {band && <circle cx={band[0]} cy={band[1]} r={band[2]} fill="url(#aa-band)" opacity="0.65" filter="url(#aa-blur-m)" />}
      {carve && <circle cx={carve[0]} cy={carve[1]} r={carve[2]} fill="#f7faf8" filter="url(#aa-blur-m)" />}
    </g>
  );
}

// ── Illustrations ────────────────────────────────────────────────────────────
function SignInArt() {
  return (
    <>
      <Sphere cx={303} cy={225} r={23} />
      <Sphere cx={162} cy={377} r={12.5} />
    </>
  );
}

function SignUpArt() {
  const TL = "114,318", TB = "170,297", TR = "232,318", TF = "184,342";
  const BL = "118,396", BF = "190,427", BR = "240,394";
  return (
    <>
      <Sphere cx={315} cy={219} r={18} />
      <Sphere cx={90} cy={347} r={10} />
      <Sphere cx={276} cy={416} r={5} blur />
      <ellipse cx={184} cy={432} rx={70} ry={12} fill="#a9cdb2" opacity="0.45" filter="url(#aa-blur-m)" />
      {/* Frosted cube: rounded by stroking each face in its own colour. */}
      <g strokeLinejoin="round" strokeWidth="20" opacity="0.92" filter="url(#aa-blur-s)">
        <polygon points={`${TL} ${TF} ${BF} ${BL}`} fill="url(#aa-cube-l)" stroke="url(#aa-cube-l)" />
        <polygon points={`${TF} ${TR} ${BR} ${BF}`} fill="url(#aa-cube-r)" stroke="url(#aa-cube-r)" />
        <polygon points={`${TL} ${TB} ${TR} ${TF}`} fill="#f1f8f2" stroke="#f1f8f2" />
      </g>
      <g fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" filter="url(#aa-blur-s)">
        <polyline points={`${TL} ${TF} ${TR}`} />
        <line x1="184" y1="342" x2="190" y2="427" />
      </g>
    </>
  );
}

function ForgotArt() {
  return (
    <>
      <ellipse cx={95} cy={283} rx={45} ry={9} fill="#a9cdb2" opacity="0.4" filter="url(#aa-blur-m)" />
      <rect x={48} y={208} width={72} height={60} rx={12} transform="rotate(-12 84 238)" fill="url(#aa-glass)" stroke="#fff" strokeOpacity="0.8" strokeWidth="1" filter="url(#aa-blur-s)" />
      <path d="M43 245 C25 262 22 290 52 295 C85 300 130 276 156 246" fill="none" stroke="url(#aa-orbit)" strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="84,232 107,247 126,227" fill="none" stroke="url(#aa-dark)" strokeWidth="9.5" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="167,210 143,219 153,222" fill="#8ed397" />
      <polygon points="167,210 153,222 157,230" fill="#26893a" />
      <Sphere cx={163} cy={177} r={8} />
    </>
  );
}

function ResetArt() {
  return (
    <>
      <path d="M148 214 C135 210 120 210 106 213" fill="none" stroke="#2f9a45" strokeWidth="1.3" opacity="0.7" />
      <ellipse cx={98} cy={292} rx={46} ry={9} fill="#a9cdb2" opacity="0.4" filter="url(#aa-blur-m)" />
      <rect x={46} y={216} width={60} height={62} rx={11} transform="rotate(-10 76 247)" fill="url(#aa-glass)" stroke="#fff" strokeOpacity="0.8" strokeWidth="1" filter="url(#aa-blur-s)" />
      <g transform="rotate(-5 98 255)">
        <path d="M78 232 V218 a15.5 15.5 0 0 1 31 0 V232" fill="none" stroke="url(#aa-dark)" strokeWidth="9" />
        <rect x={68} y={228} width={60} height={55} rx={9} fill="url(#aa-pale)" stroke="#fff" strokeWidth="1.5" />
        <circle cx={98} cy={248} r={8} fill="#0d5419" />
        <path d="M94.5 251 L101.5 251 L102.5 266 L93.5 266 Z" fill="#0d5419" />
      </g>
      <path d="M43 253 C20 275 30 305 75 299 C120 293 160 252 150 221" fill="none" stroke="url(#aa-orbit)" strokeWidth="1.4" strokeLinecap="round" />
      <Sphere cx={148} cy={214} r={5.5} />
    </>
  );
}

function VerifyArt() {
  return (
    <>
      <path d="M175 211 C160 205 140 203 128 205" fill="none" stroke="#2f9a45" strokeWidth="1.3" opacity="0.7" />
      <ellipse cx={108} cy={283} rx={52} ry={9} fill="#a9cdb2" opacity="0.4" filter="url(#aa-blur-m)" />
      <g transform="rotate(-13 104 240)">
        <rect x={64} y={212} width={82} height={56} rx={7} fill="url(#aa-pale)" stroke="#fff" strokeWidth="1.5" />
        <polygon points="64,268 104,238 146,268" fill="#e9f6ec" opacity="0.8" />
        <polyline points="66,215 105,244 144,215" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.6" strokeLinejoin="round" />
      </g>
      <path d="M36 257 C40 282 82 286 120 279 C156 272 183 246 175 213" fill="none" stroke="url(#aa-orbit)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx={141} cy={254} r={18.5} fill="#fff" opacity="0.85" />
      <circle cx={141} cy={254} r={16.5} fill="url(#aa-dark)" />
      <polyline points="133,254.5 139,260.5 149.5,248.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <Sphere cx={36} cy={257} r={6} />
      <Sphere cx={175} cy={211} r={5.5} />
    </>
  );
}

// ── Scenes ───────────────────────────────────────────────────────────────────
// logo/heading/paragraph positions are taken from the original pictures:
// x = left edge, cap = top of the capital letters, f = font size, l = line height.
const SCENES = {
  signin: {
    w: 326, h: 464, Art: SignInArt,
    backdrop: { disc: [100, 115, 170], band: [-49, 520, 228], carve: [-16, 580, 202] },
    logo: { x: 30, cy: 35.5, star: 17, f: 17 },
    heading: { x: 36, cap: 128, f: 28.7, l: 35, text: <>Welcome back<br />to <em>lectio</em></> },
    body: { x: 36, cap: 207, f: 11.6, l: 17, text: <>Continue your learning journey<br />with the power of AI.</> },
  },
  signup: {
    w: 335, h: 463, Art: SignUpArt,
    backdrop: { disc: [105, 125, 175], band: [-60, 560, 200], carve: [-80, 600, 175] },
    logo: { x: 34, cy: 37, star: 18, f: 17 },
    heading: { x: 38, cap: 135, f: 30, l: 35, text: <>Create your<br /><em>lectio</em> account</> },
    body: { x: 38, cap: 215, f: 12.7, l: 16.5, text: <>Unlock personalized learning<br />with AI.</> },
  },
  forgot: {
    w: 197, h: 338, Art: ForgotArt,
    backdrop: { disc: [20, 120, 180], band: [-35, 378, 80] },
    logo: { x: 20, cy: 33, star: 16, f: 14.3 },
    heading: { x: 24, cap: 83, f: 23.9, l: 23.5, text: <>Forgot your<br />password?</> },
    body: { x: 24, cap: 140, f: 10.1, l: 15, text: <>No worries! We'll send you<br />a reset link.</> },
  },
  reset: {
    w: 187, h: 336, Art: ResetArt,
    backdrop: { disc: [15, 120, 175] },
    logo: { x: 19, cy: 31.5, star: 15, f: 13.9 },
    heading: { x: 20, cap: 82, f: 23.6, l: 24, text: <>Set a new<br />password</> },
    body: { x: 20, cap: 138, f: 10.1, l: 14.5, text: <>Choose a strong password to<br />keep your account secure.</> },
  },
  verify: {
    w: 215, h: 337, Art: VerifyArt,
    backdrop: { disc: [25, 115, 185], band: [-35, 380, 80] },
    logo: { x: 20, cy: 30.5, star: 15, f: 13.9 },
    heading: { x: 21, cap: 80, f: 23.2, l: 25, text: <>Check your<br />email</> },
    body: { x: 21, cap: 137, f: 10.1, l: 15, text: <>We've sent a verification link<br />to your email address.</> },
  },
};

// n units of the original picture, scaled to the panel.
const s = (n) => `calc(${n} * var(--s))`;
// Turn "top of the capitals" into the top of an Inter line box.
const lineTop = ({ cap, f, l }) => cap - (l - 1.21 * f) / 2 - 0.2417 * f;

function Text({ as: Tag, spec, className }) {
  return (
    <Tag className={className} style={{ left: s(spec.x), top: s(lineTop(spec)), fontSize: s(spec.f), lineHeight: s(spec.l) }}>
      {spec.text}
    </Tag>
  );
}

export function AuthArt({ scene }) {
  const { w, h, Art, backdrop, logo, heading, body } = SCENES[scene];
  return (
    <div className="aa" aria-hidden="true">
      <div className="aa-box" style={{ "--bw": w, "--bh": h }}>
        <svg className="aa-svg" viewBox={`0 0 ${w} ${h}`}>
          <Defs />
          <Backdrop w={w} h={h} {...backdrop} />
          <Art />
        </svg>
        <div className="aa-logo" style={{ left: s(logo.x), top: s(logo.cy), fontSize: s(logo.f), gap: s(logo.star * 0.42) }}>
          <svg viewBox="0 0 24 24" style={{ width: s(logo.star), height: s(logo.star) }}>
            <path fill="url(#aa-star)" d="M12 0C12.9 7.2 16.8 11.1 24 12 16.8 12.9 12.9 16.8 12 24 11.1 16.8 7.2 12.9 0 12 7.2 11.1 11.1 7.2 12 0Z" />
          </svg>
          lectio
        </div>
        <Text as="h2" spec={heading} className="aa-heading" />
        <Text as="p" spec={body} className="aa-body" />
      </div>
    </div>
  );
}
