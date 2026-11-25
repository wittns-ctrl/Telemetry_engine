import { House, Monitor, Bell, LifeBuoy, Radio, ChartSpline, Server, Database, Settings } from "lucide-react";

// The sidebar, kept short for people who aren't technical: four everyday
// items, the expert tools folded under "Advanced", and Settings. Ids must
// match the views rendered in App.jsx; "alerts" opens the alerts window
// instead of a page.
export const MAIN_ITEMS = [
  { id: "dashboard", label: "Home", icon: House },
  { id: "devices", label: "My PCs", icon: Monitor },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "help", label: "Help", icon: LifeBuoy },
];

export const ADVANCED_ITEMS = [
  { id: "live", label: "Live Monitor", icon: Radio },
  { id: "analytics", label: "Analytics", icon: ChartSpline },
  { id: "sensors", label: "Sensors", icon: Server },
  { id: "metrics", label: "Metrics Studio", icon: Database },
];

export const OTHER_ITEMS = [
  { id: "settings", label: "Settings", icon: Settings },
];

export const ALL_PAGES = [...MAIN_ITEMS, ...ADVANCED_ITEMS, ...OTHER_ITEMS].filter((i) => i.id !== "alerts");

// One line under each page's title, saying what the page is for.
export const PAGE_INTROS = {
  live: "Every reading as your PC sends it, for watching things in real time.",
  analytics: "How your readings have changed over days and weeks.",
  sensors: "Each sensor Lectio reads on your PCs, with its latest value.",
  metrics: "The raw readings stored for your PCs, for experts and developers.",
};
