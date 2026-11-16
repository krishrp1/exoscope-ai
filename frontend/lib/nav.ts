import { Activity, BarChart3, BookOpen, Database, GitCompareArrows, LayoutDashboard, LineChart, Radar } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/observatory", label: "Overview", icon: LayoutDashboard, description: "Mission status at a glance" },
  { href: "/observatory/light-curves", label: "Light Curve Explorer", icon: LineChart, description: "Inspect Kepler photometry" },
  { href: "/observatory/detect", label: "AI Detection Studio", icon: Radar, description: "Classify a signal" },
  { href: "/observatory/compare", label: "Compare Signals", icon: GitCompareArrows, description: "Signals side by side" },
  { href: "/observatory/training", label: "Training Monitor", icon: Activity, description: "Live training telemetry" },
  { href: "/observatory/performance", label: "Model Performance", icon: BarChart3, description: "Held-out test results" },
  { href: "/observatory/dataset", label: "Dataset Explorer", icon: Database, description: "Browse the KOI catalog" },
  { href: "/observatory/about", label: "About & Methodology", icon: BookOpen, description: "How it works, and its limits" },
] as const;
