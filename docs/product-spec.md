# Product specification

**Product:** Lectio — free PC health, security and location monitoring for Windows
**Status:** live (MVP), November 2026
**Site:** https://getlectio.vercel.app

## 1. Problem

Ordinary people and small offices don't notice a PC failing until it's too
late: a clogged fan cooks the processor, a drive wears out and takes the files
with it, memory runs out and work is lost, malware sneaks in from a USB stick.
The tools that show this (HWiNFO, Task Manager, Windows Security) are
technical, live on each PC separately, and only help if someone is looking.

## 2. Users

| Persona | Needs |
| --- | --- |
| **Home user** with one or two PCs, not technical | To be told in plain words when something is wrong and what to do |
| **Family "IT person"** looking after relatives' PCs | To see all the PCs in one place and fix things remotely |
| **Small office owner** with a few PCs | Early warning before a PC fails, malware alerts, where each PC is |

## 3. Goals and non-goals

**Goals**
- Warn early and clearly about hardware, memory, disk and security problems.
- Explain each problem and offer a safe fix the owner controls.
- Work for non-technical people: plain language everywhere.
- Free to use, private by default.

**Non-goals (for now)**
- Replacing an antivirus (Lectio builds on Microsoft Defender).
- Mac, Linux or phone agents.
- Remote desktop or file access.
- Managing hundreds of PCs (enterprise MDM).

## 4. Functional requirements

| # | Requirement | Status |
| --- | --- | --- |
| F1 | Sign up with email (6-digit code) or Google; sign in; reset password; delete account | Done |
| F2 | Download a Windows agent, link a PC by signing in, run as a service from startup | Done |
| F3 | Collect readings every 5 s; buffer up to 7 days offline | Done |
| F4 | Show each PC's health: 5-question summary, details per component, history, live charts | Done |
| F5 | Raise alerts from sourced thresholds (58 rules), with duration and clear-down | Done |
| F6 | Tell the owner: dashboard pop-up and bell, email, Windows notification on the PC (critical) | Done |
| F7 | Explain each alert (AI with rule-based fallback) | Done |
| F8 | Offer fixes; run them on the PC with the owner's approval; undo where possible | Done |
| F9 | Detect malware and weak protection via Microsoft Defender; scan, update, remove from the dashboard | Done |
| F10 | Show each PC on a map: exact (Windows Location) or approximate (internet address), opt-in, owner-only | Done |
| F11 | Watch for new programs set to start with Windows | Planned |
| F12 | Laptop battery wear and charger state | Planned |
| F13 | Several people sharing one account's PCs (family/office) | Planned |

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Latency | A reading reaches the dashboard in under 10 s while online; a critical alert reaches the PC as a notification within 15 s of opening |
| Availability | 99.5% monthly for the API once on a paid plan (the free plan sleeps) |
| Scale | 100 PCs per API process at 5-second readings; more with Redis and extra processes |
| Security | OWASP ASVS level 1 baseline; see [security-assessment.md](security-assessment.md) |
| Privacy | Data minimisation; location opt-in; retention limits (raw 7 days, location 30 days) |
| Agent footprint | Under 1% CPU and ~40 MB RAM on a typical PC |
| Accessibility | WCAG 2.1 AA for the web app: keyboard use, labels, contrast |
| Language | Plain English, no jargon in user-facing text |

## 6. Success measures

- Share of linked PCs reporting daily.
- Alerts acted on (fix run or "I've dealt with this") within 24 hours.
- Critical alerts resolved without the PC failing.
- Sign-up to first linked PC conversion.

## 7. Constraints and assumptions

- Windows 10/11 with Microsoft Defender or another registered antivirus.
- Some sensors (voltages, VRM, drive health) aren't exposed by every PC.
- Free-tier hosting during the MVP: Render free, Atlas M0, Upstash free.
- Email through a Gmail sender (about 200 per day).
