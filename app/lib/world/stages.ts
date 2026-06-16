export type WorldStage =
  | "campsite"
  | "cabins"
  | "village"
  | "town"
  | "city"
  | "metropolis"
  | "empire";

export type StageConfig = {
  id: WorldStage;
  label: string;
  minRevenue: number;
  description: string;
  buildings: string[];
  palette: {
    ground: string;
    sky: string;
    accent: string;
  };
  maxAgents: number;
};

export const STAGE_CONFIGS: StageConfig[] = [
  {
    id: "campsite",
    label: "Campsite",
    minRevenue: 0,
    description: "Tents, campfires, wooden signs. The beginning.",
    buildings: ["tent", "campfire", "wooden_sign"],
    palette: { ground: "#1a2e1a", sky: "#0d0f1a", accent: "#ff9500" },
    maxAgents: 3,
  },
  {
    id: "cabins",
    label: "Cabins",
    minRevenue: 100,
    description: "Small cabins replace the tents. First signs of permanence.",
    buildings: ["cabin", "campfire", "wooden_sign"],
    palette: { ground: "#1a2e1a", sky: "#0d0f1a", accent: "#ff9500" },
    maxAgents: 5,
  },
  {
    id: "village",
    label: "Village",
    minRevenue: 1_000,
    description: "A proper village takes shape. Specialists find their buildings.",
    buildings: [
      "research_lab",
      "product_workshop",
      "website_factory",
      "marketing_studio",
      "sales_office",
      "compliance_office",
      "finance_bank",
    ],
    palette: { ground: "#0f3d2e", sky: "#0d0f1a", accent: "#00fff0" },
    maxAgents: 8,
  },
  {
    id: "town",
    label: "Town",
    minRevenue: 10_000,
    description: "The town bustles. Market stalls, more agents, neon beginning to glow.",
    buildings: ["market_row", "data_center", "support_center", "legal_office"],
    palette: { ground: "#0f3d2e", sky: "#080b18", accent: "#00fff0" },
    maxAgents: 20,
  },
  {
    id: "city",
    label: "City",
    minRevenue: 100_000,
    description: "A real city. Towers rise. Crowds move. Neon everywhere.",
    buildings: ["tower_block", "agency_hub", "finance_tower"],
    palette: { ground: "#0a1a0a", sky: "#05080f", accent: "#ff2d78" },
    maxAgents: 50,
  },
  {
    id: "metropolis",
    label: "Tech Metropolis",
    minRevenue: 1_000_000,
    description: "A tech metropolis. Holographic signs, elevated walkways, constant motion.",
    buildings: ["skyscraper", "holo_market", "ai_hub"],
    palette: { ground: "#050f05", sky: "#020408", accent: "#7c3aed" },
    maxAgents: 100,
  },
  {
    id: "empire",
    label: "Startup Empire",
    minRevenue: 10_000_000,
    description: "A futuristic startup empire. The world never sleeps.",
    buildings: ["empire_tower", "global_hq", "quantum_lab"],
    palette: { ground: "#030703", sky: "#010204", accent: "#ff2d78" },
    maxAgents: 200,
  },
];

export function getStageForRevenue(grossRevenue: number): StageConfig {
  const sorted = [...STAGE_CONFIGS].sort((a, b) => b.minRevenue - a.minRevenue);
  return sorted.find((s) => grossRevenue >= s.minRevenue) ?? STAGE_CONFIGS[0];
}

export function getNextStage(current: WorldStage): StageConfig | null {
  const idx = STAGE_CONFIGS.findIndex((s) => s.id === current);
  return STAGE_CONFIGS[idx + 1] ?? null;
}

export function revenueToNextStage(grossRevenue: number): {
  next: StageConfig | null;
  needed: number;
  progress: number;
} {
  const current = getStageForRevenue(grossRevenue);
  const next = getNextStage(current.id);
  if (!next) return { next: null, needed: 0, progress: 1 };

  const range = next.minRevenue - current.minRevenue;
  const earned = grossRevenue - current.minRevenue;
  return {
    next,
    needed: next.minRevenue - grossRevenue,
    progress: Math.min(1, earned / range),
  };
}
