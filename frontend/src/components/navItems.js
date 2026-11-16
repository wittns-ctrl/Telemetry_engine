import { LayoutGrid, Cpu, Database, Radio, ChartSpline, Server, Headset, Settings } from "lucide-react";

// The sidebar's pages. Item ids must match the views rendered in App.jsx.
export const MAIN_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "devices", label: "My Devices", icon: Cpu },
  { id: "metrics", label: "Metrics Studio", icon: Database },
  { id: "live", label: "Live Monitor", icon: Radio },
  { id: "analytics", label: "Analytics", icon: ChartSpline },
  { id: "sensors", label: "Sensors", icon: Server },
];

export const OTHER_ITEMS = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: Headset },
];
