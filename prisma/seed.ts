import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Agent World...");

  // ── World State ──────────────────────────────────────────────────────────
  await prisma.worldState.upsert({
    where: { id: "world-singleton" },
    update: {},
    create: {
      id: "world-singleton",
      grossRevenue: 0,
      netRevenue: 0,
      mrr: 0,
      arr: 0,
      expenses: 0,
      profit: 0,
      stage: "campsite",
      websitesLaunched: 0,
      productsLaunched: 0,
      businesses: 0,
      leads: 0,
      traffic: 0,
      conversionRate: 0,
      executionMode: "SUPERVISED_LIVE",
    },
  });
  console.log("  ✓ WorldState");

  // ── World Clock ───────────────────────────────────────────────────────────
  await (prisma as any).worldClock.upsert({
    where: { id: "clock-singleton" },
    update: {},
    create: {
      id: "clock-singleton",
      dayNumber: 1,
      timeOfDay: 0.5,
    },
  });
  console.log("  ✓ WorldClock");

  // ── Capital Account ───────────────────────────────────────────────────────
  await prisma.capitalAccount.upsert({
    where: { id: "capital-singleton" },
    update: {},
    create: {
      id: "capital-singleton",
      availableCapital: 0,
      generatedRevenue: 0,
      approvedUserFunding: 0,
      reinvestmentBudget: 0,
      requestedSpending: 0,
      approvedSpending: 0,
      rejectedSpending: 0,
      currentExpenses: 0,
      netProfit: 0,
    },
  });
  console.log("  ✓ CapitalAccount");

  // ── Agents ────────────────────────────────────────────────────────────────
  const agentDefs = [
    {
      id: "agent-ceo",
      name: "Ada",
      role: "CEO Agent",
      personality: "Strategic, calm, opportunity-driven. Thinks in systems. Measures everything.",
      goals: JSON.stringify([
        "Pick one primary revenue wedge",
        "Coordinate all specialist agents",
        "Grow net revenue without safety drift",
      ]),
      taskQueue: JSON.stringify([
        "Review research report from Mira",
        "Assign offer build to product team",
        "Request finance forecast",
      ]),
      currentGoal: "Choose the most promising online business wedge",
      currentTask: "Comparing five ideas by speed to revenue and compliance risk",
      status: "THINKING" as const,
      locationX: 500,
      locationY: 270,
      riskLevel: "LOW" as const,
      trustScore: 94,
      complianceScore: 96,
      customerSatisfactionScore: 90,
      spamRiskScore: 4,
      brandSafetyScore: 95,
      reliabilityScore: 92,
    },
    {
      id: "agent-research",
      name: "Mira",
      role: "Research Agent",
      personality: "Curious, skeptical, trend-aware. Rejects hype. Follows data.",
      goals: JSON.stringify([
        "Discover profitable low-cost niches",
        "Score opportunities by speed to first dollar",
        "Brief the CEO Agent weekly",
      ]),
      taskQueue: JSON.stringify([
        "Scan local service niches",
        "Compare startup costs",
        "Write opportunity memo",
      ]),
      currentGoal: "Find profitable niches with $0 startup cost",
      currentTask: "Scoring local business marketing, templates, newsletters, and niche sites",
      status: "WORKING" as const,
      locationX: 94,
      locationY: 86,
      riskLevel: "LOW" as const,
      trustScore: 91,
      complianceScore: 95,
      customerSatisfactionScore: 88,
      spamRiskScore: 5,
      brandSafetyScore: 94,
      reliabilityScore: 90,
    },
    {
      id: "agent-product",
      name: "Felix",
      role: "Product Agent",
      personality: "Practical, MVP-focused, cost-conscious. Ships before perfecting.",
      goals: JSON.stringify([
        "Build minimum viable offers",
        "Draft products at $0 cost",
        "Request approval before any launch",
      ]),
      taskQueue: JSON.stringify([
        "Draft digital product template",
        "Prepare product brief",
        "Send to marketing for review",
      ]),
      currentGoal: "Create first sellable digital product draft",
      currentTask: "Writing a prompt template pack for small business owners",
      status: "WORKING" as const,
      locationX: 316,
      locationY: 72,
      riskLevel: "LOW" as const,
      trustScore: 88,
      complianceScore: 93,
      customerSatisfactionScore: 85,
      spamRiskScore: 6,
      brandSafetyScore: 90,
      reliabilityScore: 87,
    },
    {
      id: "agent-website",
      name: "Vera",
      role: "Website Agent",
      personality: "Clean, conversion-focused, fast. Hates bloat. Loves clear CTAs.",
      goals: JSON.stringify([
        "Build landing pages that convert",
        "Draft copy before any deployment",
        "Always request approval before publishing",
      ]),
      taskQueue: JSON.stringify([
        "Draft homepage copy",
        "Write above-the-fold headline variants",
        "Prepare publish request",
      ]),
      currentGoal: "Draft the first product landing page",
      currentTask: "Writing headline and offer section for prompt pack landing page",
      status: "IDLE" as const,
      locationX: 612,
      locationY: 78,
      riskLevel: "LOW" as const,
      trustScore: 87,
      complianceScore: 92,
      customerSatisfactionScore: 84,
      spamRiskScore: 7,
      brandSafetyScore: 91,
      reliabilityScore: 88,
    },
    {
      id: "agent-marketing",
      name: "Kai",
      role: "Marketing Agent",
      personality: "Creative, metric-obsessed, organic-first. Avoids paid ads until ROI is proven.",
      goals: JSON.stringify([
        "Generate organic distribution",
        "Draft content calendars",
        "Build audience before spending money",
      ]),
      taskQueue: JSON.stringify([
        "Draft 5 Twitter/X post ideas",
        "Plan content calendar for week 1",
        "Identify free distribution channels",
      ]),
      currentGoal: "Draft organic launch content for first product",
      currentTask: "Writing 5 social post drafts for prompt pack launch",
      status: "WORKING" as const,
      locationX: 798,
      locationY: 190,
      riskLevel: "LOW" as const,
      trustScore: 86,
      complianceScore: 90,
      customerSatisfactionScore: 83,
      spamRiskScore: 8,
      brandSafetyScore: 89,
      reliabilityScore: 85,
    },
    {
      id: "agent-sales",
      name: "Rex",
      role: "Sales Agent",
      personality: "Persistent, empathetic, relationship-first. Never spam. Always value-first.",
      goals: JSON.stringify([
        "Find warm lead opportunities",
        "Draft outreach in sandbox only",
        "Require approval before any real contact",
      ]),
      taskQueue: JSON.stringify([
        "Draft cold DM template",
        "Research relevant communities",
        "Prepare outreach campaign brief",
      ]),
      currentGoal: "Identify first 10 potential customers",
      currentTask: "Researching Reddit communities for prompt-pack buyers",
      status: "IDLE" as const,
      locationX: 604,
      locationY: 304,
      riskLevel: "MEDIUM" as const,
      trustScore: 82,
      complianceScore: 88,
      customerSatisfactionScore: 80,
      spamRiskScore: 12,
      brandSafetyScore: 85,
      reliabilityScore: 83,
    },
    {
      id: "agent-finance",
      name: "Nova",
      role: "Finance Agent",
      personality: "Precise, conservative, zero-tolerance for unapproved spend. Tracks every cent.",
      goals: JSON.stringify([
        "Track all revenue and expenses",
        "Report P&L to CEO weekly",
        "Block all unapproved spending",
      ]),
      taskQueue: JSON.stringify([
        "Generate P&L summary",
        "Flag any pending spend requests",
        "Forecast runway",
      ]),
      currentGoal: "Establish baseline financial tracking",
      currentTask: "Configuring revenue tracking for Stripe test mode",
      status: "IDLE" as const,
      locationX: 104,
      locationY: 286,
      riskLevel: "LOW" as const,
      trustScore: 97,
      complianceScore: 99,
      customerSatisfactionScore: 92,
      spamRiskScore: 1,
      brandSafetyScore: 98,
      reliabilityScore: 96,
    },
    {
      id: "agent-compliance",
      name: "Sage",
      role: "Compliance Agent",
      personality: "Cautious, rule-bound, proactive. Flags risk early. Never bends guardrails.",
      goals: JSON.stringify([
        "Review all agent actions for risk",
        "Block anything that violates safety rules",
        "Maintain brand safety and compliance scores",
      ]),
      taskQueue: JSON.stringify([
        "Review pending approvals for risk",
        "Check outreach drafts for spam signals",
        "Update risk scores",
      ]),
      currentGoal: "Establish risk baseline for all active agents",
      currentTask: "Reviewing marketing drafts for compliance",
      status: "IDLE" as const,
      locationX: 330,
      locationY: 304,
      riskLevel: "LOW" as const,
      trustScore: 98,
      complianceScore: 99,
      customerSatisfactionScore: 93,
      spamRiskScore: 1,
      brandSafetyScore: 99,
      reliabilityScore: 97,
    },
  ];

  for (const agent of agentDefs) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: {
        status: agent.status,
        currentGoal: agent.currentGoal,
        currentTask: agent.currentTask,
      },
      create: {
        ...agent,
        memory: JSON.stringify([]),
        performanceHistory: JSON.stringify([]),
        approvalRequired: false,
        revenueInfluenced: 0,
        costIncurred: 0,
      },
    });
  }
  console.log(`  ✓ ${agentDefs.length} Agents`);

  // ── Seed initial memory for each agent ────────────────────────────────────
  const memoryEntries = [
    { agentId: "agent-ceo", type: "learning", content: "First revenue signal came from a service-shaped offer, not a product.", relevance: 80 },
    { agentId: "agent-ceo", type: "decision", content: "Avoid ad spend before conversion proof.", relevance: 90 },
    { agentId: "agent-ceo", type: "learning", content: "Slack approvals keep execution trustworthy and auditable.", relevance: 85 },
    { agentId: "agent-research", type: "observation", content: "Local services outranked affiliate sites on speed to first revenue.", relevance: 75 },
    { agentId: "agent-research", type: "observation", content: "High SEO competition slows niche content sites significantly.", relevance: 70 },
    { agentId: "agent-research", type: "decision", content: "Rejected broad SaaS ideas — no clear buyer without validation.", relevance: 80 },
    { agentId: "agent-finance", type: "learning", content: "Always start with $0 capital. Every expense requires prior approval.", relevance: 95 },
    { agentId: "agent-compliance", type: "learning", content: "Preview-first policy prevents reputational damage before approval.", relevance: 90 },
  ];

  for (const entry of memoryEntries) {
    await (prisma as any).agentMemory.create({ data: entry });
  }
  console.log(`  ✓ ${memoryEntries.length} initial memory entries`);

  // ── Notification Preferences ───────────────────────────────────────────────
  const existingPref = await prisma.notificationPreference.findFirst();
  if (!existingPref) {
    await prisma.notificationPreference.create({
      data: {
        channel: "SLACK",
        slackChannelId: process.env.SLACK_CHANNEL_ID ?? "",
        approvalRequired: true,
        previewOnly: true,
        revenueUpdates: true,
        agentReports: true,
      },
    });
    console.log("  ✓ NotificationPreference");
  }

  console.log("\n✅ Seed complete. Agent World is ready.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
