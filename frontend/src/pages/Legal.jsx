import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft } from 'lucide-react';
import { SITE } from '../siteInfo';
import './legal.css';

// Business details live in src/siteInfo.js (shared with the landing footer).
// Anything left as null shows up on the page as a highlighted [placeholder].
const LEGAL = SITE;

function Fill({ value, label }) {
  if (value) return value;
  return <mark className="lg-todo" title="Fill this in in src/siteInfo.js">[{label}]</mark>;
}

const Company = () => <Fill value={LEGAL.company} label="Your company name" />;
function Contact() {
  if (!LEGAL.contactEmail) return <Fill label="contact email" />;
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}

function LegalPage({ title, intro, children }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Lectio`;
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [title]);

  return (
    <div className="lg">
      <header className="lg-top">
        <Link className="lg-brand" to="/" aria-label="Lectio home">
          <span className="lg-brand-mark"><Activity size={16} strokeWidth={2.6} /></span>
          Lectio
        </Link>
        <Link className="lg-back" to="/"><ArrowLeft size={15} /> Back to home</Link>
      </header>

      <main className="lg-main">
        <p className="lg-kicker">Legal</p>
        <h1>{title}</h1>
        <p className="lg-meta">Last updated {LEGAL.lastUpdated}</p>
        <p className="lg-intro">{intro}</p>
        {!LEGAL.company && (
          <aside className="lg-draft" role="note">
            <b>Draft.</b> Highlighted items in [brackets] still need your details. This page is a starting point,
            not legal advice. Have it reviewed before you rely on it.
          </aside>
        )}
        <div className="lg-body">{children}</div>
      </main>

      <footer className="lg-foot">
        <span>© {new Date().getFullYear()} Lectio</span>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/signin">Log in</Link>
        </nav>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy policy                                                      */
/* Written from what the app actually does; update it if that changes. */
/* ------------------------------------------------------------------ */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what Lectio collects when you use it, why, who it is shared with, and the choices you have."
    >
      <h2>Who we are</h2>
      <p>
        Lectio is run by <Company />. We are responsible for the personal data described here. You can reach us
        about anything in this policy at <Contact />.
      </p>

      <h2>What we collect</h2>
      <h3>Your account</h3>
      <ul>
        <li>Your name and email address.</li>
        <li>Your password, stored only as a one-way hash. We never see or store the password itself.</li>
        <li>If you sign in with Google: your Google account ID, name and email address. We do not get your Google password.</li>
        <li>Whether your email is verified, when your account was created and when you last signed in.</li>
      </ul>
      <h3>Your machines and readings</h3>
      <ul>
        <li>For each machine you connect: the device name (by default, the computer&apos;s network name), its operating system and version, and a random ID the agent creates for it.</li>
        <li>
          Hardware readings sent by the agent or the API, such as temperatures, CPU, GPU and memory use, network
          throughput, power, fan speed, voltages, disk health and hardware error counts, each with the time it was taken.
        </li>
        <li>Alerts raised when a reading crosses a limit, and any diagnostic reports generated for them.</li>
      </ul>
      <h3>Security records</h3>
      <p>
        When you sign in, sign out, reset your password or change your account, we record the event, your IP address
        and your browser&apos;s user agent. We use this to protect your account and investigate misuse.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one cookie, <code>refresh_token</code>, which keeps you signed in. It is strictly necessary and cannot be
        read by scripts on the page. We do not use analytics, advertising or tracking cookies.
      </p>

      <h2>How we use your data</h2>
      <ul>
        <li>To run the service: store your readings, show your dashboard, and raise alerts.</li>
        <li>To send account emails, such as verifying your address and resetting your password.</li>
        <li>To generate AI diagnostic reports for alerts (see below).</li>
        <li>To keep the service secure, limit abuse and fix problems.</li>
      </ul>
      <p>
        We process your data because it is needed to provide the service you signed up for, and, for security records,
        because we have a legitimate interest in keeping accounts safe. We do not sell your data or use it for advertising.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li><b>Hosting:</b> your account and readings are stored with <Fill value={LEGAL.hosting} label="hosting provider and region" />.</li>
        <li><b>Email delivery:</b> account emails are sent through <Fill value={LEGAL.emailProvider} label="email provider" />, which receives your email address and the message.</li>
        <li><b>Google:</b> only if you choose to sign in with Google.</li>
        <li>
          <b>OpenAI:</b> when a diagnostic report is generated for an alert, we send OpenAI the alert details, a summary
          of that machine&apos;s readings from the five minutes around it, and the device&apos;s internal ID. We do not send
          your name or email address. If OpenAI is unavailable, the report is generated on our own servers instead.
        </li>
      </ul>
      <p>We may also disclose data if the law requires it.</p>

      <h2>International transfers</h2>
      <p>
        Some of these providers, including OpenAI, process data in the United States. Where data leaves your country, we rely
        on the safeguards the provider offers, such as standard contractual clauses.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account details, machines, readings and alerts are kept while your account is open.</li>
        <li>Security records are kept for <Fill value={LEGAL.logRetention} label="retention period" />.</li>
        <li>
          You can delete your account at any time under Settings. This immediately and permanently erases your account,
          machines, readings, alerts and security records, and signs you out everywhere. Copies in our backups are
          overwritten as those backups expire.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you can ask to see the data we hold about you, correct it, delete it, get a copy of
        it, or object to how we use it. Email <Contact /> and we will reply within 30 days. If you are unhappy with our
        answer, you can complain to your local data protection authority.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, connections are encrypted, and each account can only see its own machines and readings.
        No system is perfectly secure, so please use a strong, unique password.
      </p>

      <h2>Children</h2>
      <p>Lectio is not meant for anyone under 16, and we do not knowingly collect their data.</p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we will update the date at the top. If the change is significant, we will also tell you
        by email or in the app before it takes effect.
      </p>
    </LegalPage>
  );
}

/* ------------------------------------------------------------------ */
/* Terms of service                                                    */
/* ------------------------------------------------------------------ */
export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms are the agreement between you and Lectio when you use the website, the dashboard, the API or the agent."
    >
      <h2>1. Agreement</h2>
      <p>
        Lectio is provided by <Company />. By creating an account or using Lectio, you agree to these terms and to our{' '}
        <Link to="/privacy">Privacy Policy</Link>. If you use Lectio for an organisation, you confirm you are allowed to
        accept these terms for it.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 16 years old.</li>
        <li>Give accurate details and keep your password private. You are responsible for what happens under your account.</li>
        <li>
          The agent stores a device key on each machine you connect. Treat it like a password, and remove the machine from
          your account if it is lost or handed on.
        </li>
        <li>Tell us straight away at <Contact /> if you think someone else has accessed your account.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>connect machines you do not own or are not allowed to monitor;</li>
        <li>send data you have no right to send, or anything unlawful;</li>
        <li>try to access other accounts, probe or break our security, or get around rate limits;</li>
        <li>overload the service on purpose, or resell it without our written permission.</li>
      </ul>
      <p>We may suspend accounts that break these rules or put the service or other users at risk.</p>

      <h2>4. Your data</h2>
      <p>
        You own the readings and other data you send to Lectio. You allow us to store and process it only as needed to run
        the service for you, as described in the Privacy Policy.
      </p>

      <h2>5. Alerts and AI diagnostics</h2>
      <p>
        Alerts can be delayed or missed, for example if a machine goes offline or the service is interrupted. Do not use
        Lectio as the only safeguard for equipment where a missed alert could cause harm, injury or serious loss.
      </p>
      <p>
        Diagnostic reports are generated automatically and can be wrong. They are suggestions, not professional advice.
        Check them before acting on them, and take care when working inside any machine.
      </p>

      <h2>6. Price</h2>
      <p>
        Lectio is currently free. If we introduce paid plans, we will tell you in advance, and nothing you are already
        using will start costing money without your agreement.
      </p>

      <h2>7. Availability and changes</h2>
      <p>
        We work to keep Lectio running, but we do not promise it will always be available or free of errors. We may change
        or remove features. If we plan to shut the service down, we will give you reasonable notice so you can export your data.
      </p>

      <h2>8. Ending your account</h2>
      <p>
        You can stop using Lectio and delete your account at any time. We may end or suspend your account if you seriously
        or repeatedly break these terms.
      </p>

      <h2>9. Disclaimers and liability</h2>
      <p>
        Lectio is provided &ldquo;as is&rdquo;. As far as the law allows, we are not liable for indirect or consequential
        loss, lost profits, lost data, or damage to equipment arising from your use of Lectio or from relying on its alerts
        or reports. Nothing in these terms limits liability that cannot legally be limited, or the rights you have as a consumer.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms. We will change the date at the top, and tell you in advance by email or in the app if a
        change is significant. If you keep using Lectio after that, you accept the new terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of <Fill value={LEGAL.governingLaw} label="country" />. If you are a consumer,
        you also keep the protections of the laws where you live.
      </p>

      <h2>12. Contact</h2>
      <p>Questions about these terms: <Contact />.</p>
    </LegalPage>
  );
}
