import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { AuthArt } from "./AuthArt";
import "./auth.css";

// n pixels of the design mock-up, scaled with the form. See auth.css.
export const u = (n) => `calc(${n} * var(--u))`;

// ── Page: artwork on the left half, form on the right half ───────────────────
// formWidth and padX are in mock-up pixels; small = the three shorter forms.
export function AuthPageLayout({ art, formWidth, padX, small = false, footnote, children }) {
  const vars = { "--fw": formWidth, "--fh": small ? 396 : 541, "--px": padX };
  return (
    <div className={`au${small ? " au-sm" : ""}`} style={vars}>
      <AuthArt scene={art} />
      <div className="au-side">
        <Link to="/" className="au-home" aria-label="Back to home"><ArrowLeft aria-hidden="true" />Back</Link>
        <main className="au-panel">{children}</main>
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
  // The Lectio mark (see LectioMark.jsx), in its on-light colours, fitted to the 24 x 24 tile.
  mark: (
    <g transform="translate(4.78 2) scale(0.4444)">
      <path fill="#414142" d="M0 0H13V32.5H32.5V45H0Z" />
      <path fill="#2e8b37" d="M19 0H32.5V25.4L25.75 20.4L19 25.4Z" />
    </g>
  ),
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

export function AuthHeading({ icon = "mark", title, children }) {
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
