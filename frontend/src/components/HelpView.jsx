import React, { useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { AGENT_DOWNLOAD_URL } from "../services/api";
import { Card, Empty, PromoArt } from "./ui";

// Help: a green banner with a search box, then questions that open one at a
// time. The search filters the questions by their title and answer.

const TOPICS = [
  {
    id: "agent",
    title: "How do I start the agent?",
    body: "Download lectio-agent.exe on the Windows PC you want to monitor, right-click it and choose Run as administrator (so it can read temperatures and fan speeds). If Windows says it protected your PC, choose More info, then Run anyway. The agent asks for your Lectio email and password the first time only; your password is used for that one registration and is not stored. Keep the window open: readings are sent while it runs.",
    download: true,
    page: "devices",
    action: "Open My Devices",
  },
  {
    id: "devices",
    title: "Monitor a computer",
    body: "Run the Lectio agent on the PC you want to watch. It signs in once, registers the PC, and then sends hardware readings every few seconds. The PC appears under My Devices, where you can also remove it.",
    page: "devices",
    action: "Open My Devices",
  },
  {
    id: "metrics",
    title: "See every reading at once",
    body: "Metrics Studio lists every reading the agent on your PC sends, with its value now, its limit, a line of the last two minutes and its status. It updates every couple of seconds.",
    page: "metrics",
    action: "Open Metrics Studio",
  },
  {
    id: "live",
    title: "Watch readings live",
    body: "Live Monitor graphs your PC's main readings as the agent sends them and lists its open alerts. Readings only arrive while the agent is running on that PC.",
    page: "live",
    action: "Open Live Monitor",
  },
  {
    id: "settings",
    title: "Manage your account",
    body: "Change your name or password, resend the verification email, or permanently delete your account from Settings.",
    page: "settings",
    action: "Open Settings",
  },
  {
    id: "alerts",
    title: "When do alerts fire?",
    body: "A reading that stays over its limit raises an alert. The alert closes by itself once the reading is back to normal, or when the PC stops reporting that reading for a while, and you can close it yourself on My Devices. Metrics Studio shows every reading's limit. Open alerts are listed on Live Monitor and on My Devices, where you can diagnose and fix them.",
    page: "live",
    action: "Open Live Monitor",
  },
];

export function HelpView({ onNavigate }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("agent");

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = TOPICS.filter((t) => {
    const text = `${t.title} ${t.body} ${t.download ? "download exe windows" : ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  // While searching, a single match opens by itself.
  const open = words.length && shown.length === 1 ? shown[0].id : openId;

  return (
    <div className="page">
      <section className="promo" style={{ flex: "none", minHeight: "calc(92 * var(--u))" }} aria-label="Search help">
        <PromoArt />
        <span className="promo-brand">Lectio Help</span>
        <h2 className="promo-title" style={{ top: "calc(30 * var(--u))" }}>How can we help?</h2>
        <form className="promo-find" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help: agent, alerts, password..."
            aria-label="Search help topics"
          />
        </form>
      </section>

      <Card className="pad f1 faq">
        {shown.length === 0 && (
          <Empty title="No help topics match">
            <span>Try a different word, such as agent, alerts or password.</span>
          </Empty>
        )}
        {shown.map((topic) => {
          const isOpen = open === topic.id;
          const Arrow = isOpen ? ChevronUp : ChevronDown;
          return (
            <div key={topic.id}>
              <h3>
                <button type="button" aria-expanded={isOpen} aria-controls={`help-${topic.id}`} onClick={() => setOpenId(isOpen ? null : topic.id)}>
                  {topic.title}
                  <Arrow strokeWidth={2} aria-hidden="true" />
                </button>
              </h3>
              {isOpen && (
                <div className="faq-body" id={`help-${topic.id}`}>
                  <p className="txt">{topic.body}</p>
                  <span className="row ac wrap" style={{ gap: "calc(4 * var(--u))" }}>
                    {topic.download && <a className="vd" href={AGENT_DOWNLOAD_URL}>Download for Windows</a>}
                    <button type="button" className="vd" onClick={() => onNavigate?.(topic.page)}>{topic.action}</button>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
