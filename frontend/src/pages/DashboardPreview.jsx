import React from 'react';
import { Bell, ChevronLeft, LogOut, Search, SlidersHorizontal, Wrench } from 'lucide-react';
import { LectioMark } from '../components/LectioMark';
import { MAIN_ITEMS, OTHER_ITEMS } from '../components/navItems';
import { READING_COUNT } from '../components/readings';
import { answersFor } from '../components/healthAnswers';
import { PromoArt } from '../components/ui';
import { SAMPLE_SNAPSHOT } from './previewData';

/*
 * A static miniature of the signed-in Home page for the landing page's
 * tablet, filled with the app's sample data: the black sidebar, the four
 * plain questions answered (as on the real Home), the alerts card and the
 * Lectio AI card. Sizes are in --p: one pixel of the 1280px-wide dashboard.
 */

const ANSWERS = answersFor(SAMPLE_SNAPSHOT);
export function DashboardPreview() {
  return (
    <div className="pv" aria-hidden="true">
      <aside className="pv-side">
        <div className="pv-brand">
          <LectioMark size="calc(26 * var(--p))" on="dark" />
          <span>Lectio</span>
          <i className="pv-toggle"><ChevronLeft /></i>
        </div>
        <div className="pv-cap">Menu</div>
        {MAIN_ITEMS.map(({ id, label, icon: Icon }, i) => (
          <div key={id} className={`pv-nav${i === 0 ? ' on' : ''}`}><i><Icon /></i>{label}</div>
        ))}
        <div className="pv-nav pv-gap"><i><SlidersHorizontal /></i>Advanced</div>
        {OTHER_ITEMS.map(({ id, label, icon: Icon }) => (
          <div key={id} className="pv-nav pv-gap"><i><Icon /></i>{label}</div>
        ))}
        <div className="pv-acct">
          <div className="pv-cap">User account</div>
          <div className="pv-who">
            <span className="pv-ava">AM</span>
            <span><b>Alex Morgan</b><small>Account settings</small></span>
            <LogOut />
          </div>
        </div>
      </aside>

      <div className="pv-panel">
        <div className="pv-top">
          <h3>Home</h3>
          <span className="pv-search"><Search />Search your PCs, alerts, readings…</span>
          <span className="pv-bell"><Bell /></span>
        </div>

        <div className="pv-tabs">
          <small>Office PC · updated just now</small>
        </div>

        <div className="pv-card pv-sum">
          {ANSWERS.map((a) => (
            <div key={a.id} className={`pv-sum-row ${a.state}`}>
              <i />
              <span><b>{a.question}</b><small>{a.text}</small></span>
            </div>
          ))}
          <u>Show advanced details ›</u>
        </div>

        <div className="pv-low">
          <div className="pv-card pv-alerts">
            <span className="pv-alerts-ico"><Wrench /></span>
            <span><b>1 alert: memory almost full</b><small>Lectio tells you the moment something goes wrong, with a button to fix it.</small></span>
          </div>
          <div className="pv-card pv-promo">
            <PromoArt />
            <span className="pv-promo-brand"><LectioMark size="calc(16 * var(--p))" on="dark" />Lectio AI</span>
            <span className="pv-promo-go">↗</span>
            <span className="pv-promo-title">Let Lectio diagnose<br />your PC</span>
            <span className="pv-tag a">AI Diagnosis</span>
            <span className="pv-tag b">Fixes</span>
            <span className="pv-promo-foot">{READING_COUNT} readings watched</span>
          </div>
        </div>
      </div>
    </div>
  );
}
