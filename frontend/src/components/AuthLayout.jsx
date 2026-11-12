import React, { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import "./auth.css";

// n pixels of the design mock-up, scaled with the card. See auth.css.
export const u = (n) => `calc(${n} * var(--u))`;

// ── Page: picture on the left, form panel on the right ───────────────────────
// width, imageWidth, padTop and padX are in mock-up pixels.
export function AuthPageLayout({ image, width, imageWidth, padX, padTop, small = false, footnote, children }) {
  const vars = {
    "--w": width,
    "--l": imageWidth,
    "--h": small ? 396 : 541,
    "--pt": padTop ?? (small ? 46 : 40),
    "--px": padX,
  };
  return (
    <div className="au">
      <div className="au-wrap">
        <main className={`au-card${small ? " au-sm" : ""}`} style={vars}>
          <div className="au-art"><img src={image} alt="" /></div>
          <div className="au-panel">{children}</div>
        </main>
        {footnote && <p className="au-foot au-footnote">{footnote}</p>}
      </div>
    </div>
  );
}

// ── Icon tile, title and one line of help text ───────────────────────────────
const greenFill = (
  <defs>
    <linearGradient id="au-green" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#3c9a45" />
      <stop offset="1" stopColor="#0f5917" />
    </linearGradient>
  </defs>
);

const TILE_ICONS = {
  star: <path fill="url(#au-green)" d="M12 1.5C12.9 7.2 16.8 11.1 22.5 12 16.8 12.9 12.9 16.8 12 22.5 11.1 16.8 7.2 12.9 1.5 12 7.2 11.1 11.1 7.2 12 1.5Z" />,
  mail: (
    <>
      <rect x="2" y="5" width="20" height="14.5" rx="2.6" fill="url(#au-green)" />
      <path d="M4 7.6l8 5.6 8-5.6" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  lock: (
    <>
      <path d="M7.6 11V8a4.4 4.4 0 0 1 8.8 0v3" fill="none" stroke="url(#au-green)" strokeWidth="2.6" />
      <rect x="4.5" y="10" width="15" height="11.5" rx="2.8" fill="url(#au-green)" />
      <path d="M12 13.6l1.7 1.9h-1.1v2.6h-1.2v-2.6h-1.1z" fill="#fff" />
    </>
  ),
};

export function AuthHeading({ icon = "star", title, children }) {
  return (
    <>
      <div className="au-tile">
        <svg viewBox="0 0 24 24" aria-hidden="true">{greenFill}{TILE_ICONS[icon]}</svg>
      </div>
      <h1 className="au-title">{title}</h1>
      <p className="au-sub">{children}</p>
    </>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export function Field({ icon: Icon, style, children, ...inputProps }) {
  return (
    <label className="au-field" style={style}>
      <Icon aria-hidden="true" />
      <input {...inputProps} />
      {children}
    </label>
  );
}

export function PasswordField(props) {
  const [show, setShow] = useState(false);
  return (
    <Field icon={LockKeyhole} type={show ? "text" : "password"} {...props}>
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <Eye /> : <EyeOff />}
      </button>
    </Field>
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────
export function ErrorBanner({ msg }) {
  return msg ? <div role="alert" className="au-banner au-banner-error">{msg}</div> : null;
}

export function SuccessBanner({ msg }) {
  return msg ? <div role="status" className="au-banner au-banner-ok">{msg}</div> : null;
}

// ── Brand marks for the social buttons ───────────────────────────────────────
export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: u(17), height: u(17) }}>
      <path fill="#0a0a0a" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}
