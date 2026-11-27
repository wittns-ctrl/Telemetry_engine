// The summary page (approved option B): four questions an ordinary person asks
// about their PC, answered in plain words from the latest snapshot. Each
// answer is "ok", "warn" or "unknown" (the PC doesn't report it), with a
// sentence and the dashboard tab that holds the details.

import { GROUPS, valueOf, statusOf, show } from "./readings";
import { safeAnswer } from "./security";

const READINGS = Object.fromEntries(GROUPS.flatMap((g) => g.readings.map((r) => [r.id, r])));

function read(id, snapshot) {
  const reading = READINGS[id];
  const value = valueOf(reading, snapshot);
  return { reading, value, warn: value !== null && statusOf(reading, value).warn, shown: show(reading, value) };
}

const reported = (r) => r.value !== null && r.value !== undefined;
const list = (parts) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Temperatures in plain words: which part it is, and which tab shows it.
const HEAT = [
  ["cpu_core_temp", "the processor", "cpu"],
  ["cpu_package_temp", "the processor", "cpu"],
  ["gpu_core_temp", "the graphics card", "gpu"],
  ["gpu_hotspot", "the graphics card", "gpu"],
  ["vrm_temp", "the motherboard's power parts", "board"],
  ["chipset_temp", "the motherboard", "board"],
  ["disk_temp", "the drive", "storage"],
];

function tooHot(s) {
  const temps = HEAT.map(([id, part, tab]) => ({ ...read(id, s), part, tab })).filter(reported);
  const throttling = read("cpu_throttle", s);
  const hot = temps.filter((t) => t.warn).sort((a, b) => b.value - a.value);
  if (hot.length) {
    const t = hot[0];
    const extra = throttling.warn ? " It's slowing itself down to cool off." : "";
    return { state: "warn", tab: t.tab, text: `Yes. ${capital(t.part)} is at ${t.shown}, over the ${t.reading.warnAt}°C safe limit.${extra}` };
  }
  if (throttling.warn) {
    return { state: "warn", tab: "cpu", text: "Yes. The processor is slowing itself down to cool off." };
  }
  if (!temps.length) return { state: "unknown", tab: "cpu", text: "This PC doesn't report its temperatures." };
  // The part closest to its own limit (core 54 of 80 beats package 56 of 95);
  // parts without a limit only when nothing else is reported.
  const limited = temps.filter((t) => t.reading.warnAt !== undefined);
  const top = limited.length
    ? [...limited].sort((a, b) => b.value / b.reading.warnAt - a.value / a.reading.warnAt)[0]
    : [...temps].sort((a, b) => b.value - a.value)[0];
  const limit = top.reading.warnAt !== undefined ? `; Lectio warns you at ${top.reading.warnAt}°C` : "";
  const label = limited.length ? "The warmest part" : "The hottest part";
  return { state: "ok", tab: top.tab, text: `No. ${label}, ${top.part}, is at ${top.shown}${limit}.` };
}

function struggling(s) {
  const cpu = read("cpu_util", s);
  const gpu = read("gpu_util", s);
  const ram = read("ram_usage", s);
  const busy = [
    cpu.warn && [`the processor is ${cpu.shown} busy`, "cpu"],
    gpu.warn && [`the graphics card is ${gpu.shown} busy`, "gpu"],
    ram.warn && [`${ram.shown} of its memory is in use`, "ram"],
  ].filter(Boolean);
  if (busy.length) {
    const advice = busy.some(([, tab]) => tab === "ram")
      ? " Closing programs you aren't using would help."
      : " A program may be working it hard.";
    return { state: "warn", tab: busy.length === 1 ? busy[0][1] : "processes", text: `Yes. ${capital(list(busy.map(([t]) => t)))}.${advice}` };
  }
  const parts = [
    reported(cpu) && `${cpu.shown} of its processor`,
    reported(ram) && `${ram.shown} of its memory`,
  ].filter(Boolean);
  if (!parts.length) return { state: "unknown", tab: "cpu", text: "This PC doesn't report how busy it is." };
  return { state: "ok", tab: "processes", text: `No. It's using ${list(parts)}.` };
}

function storage(s) {
  const used = read("disk_used", s);
  const health = read("disk_smart", s);
  const realloc = read("disk_realloc", s);
  const bad = read("disk_bad", s);
  const drive = s?.storage?.[0];
  const free = drive?.available_capacity_gb;
  const freeText = free !== null && free !== undefined ? `${Math.round(free).toLocaleString("en-US")} GB` : null;

  if (health.warn) {
    return { state: "warn", tab: "storage", text: `The drive is wearing out: ${health.shown} health left. Back up your files now.` };
  }
  if (realloc.warn || bad.warn) {
    return { state: "warn", tab: "storage", text: "The drive has damaged areas. Back up your files and have it checked." };
  }
  if (used.warn) {
    const left = freeText ? `, ${freeText} left` : "";
    return { state: "warn", tab: "storage", text: `Almost full: ${used.shown} used${left}. Clearing old files would help.` };
  }
  if (!reported(used) && !reported(health)) return { state: "unknown", tab: "storage", text: "This PC doesn't report its drive." };
  const space = freeText ? `${freeText} free` : `${used.shown} used`;
  const healthy = reported(health) ? ", and the drive reports itself healthy" : "";
  return { state: "ok", tab: "storage", text: `Yes. ${space}${healthy}.` };
}

function broken(s) {
  const whea = read("ram_whea", s);
  const psu = read("psu_12v", s);
  const problems = [];
  if (whea.warn) problems.push(`Windows has logged ${whea.value} hardware error${whea.value === 1 ? "" : "s"}`);
  if (psu.warn) problems.push(`the power supply is at ${psu.shown}, outside the safe range of ${psu.reading.warnBelow}–${psu.reading.warnAt} V`);
  if (problems.length) {
    return { state: "warn", tab: psu.warn && !whea.warn ? "board" : "ram", text: `Possibly. ${capital(list(problems))}.` };
  }
  if (!reported(whea) && !reported(psu)) return { state: "unknown", tab: "ram", text: "This PC doesn't report hardware errors." };
  const parts = [reported(whea) && "there are no hardware errors", reported(psu) && "the power supply is steady"].filter(Boolean);
  return { state: "ok", tab: reported(whea) ? "ram" : "board", text: `No. ${capital(list(parts))}.` };
}

export const QUESTIONS = [
  { id: "heat", question: "Is it too hot?", answer: tooHot },
  { id: "load", question: "Is it struggling?", answer: struggling },
  { id: "storage", question: "Is my storage OK?", answer: storage },
  { id: "broken", question: "Is anything broken?", answer: broken },
  // The security report can come from the device until a live reading has it.
  { id: "safe", question: "Is it safe?", answer: (s, security) => ({ ...safeAnswer(s.security || security), tab: "security" }) },
];

/** Every question with its answer for this snapshot. */
export function answersFor(snapshot, security = null) {
  return QUESTIONS.map((q) => ({ ...q, ...q.answer(snapshot, security) }));
}
