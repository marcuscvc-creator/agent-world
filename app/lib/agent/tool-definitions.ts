import type OpenAI from "openai";

type Tool = OpenAI.Chat.ChatCompletionTool;

export const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "request_approval",
      description:
        "Queue a real-world action for human review before execution. Use this before sending any email, publishing content, spending money, contacting anyone externally, or taking any action with real-world consequences. The human will approve, reject, or request modifications via Slack.",
      parameters: {
        type: "object",
        required: ["actionType", "title", "summary", "proposedAction", "reason", "riskLevel", "expectedUpside", "downside", "exactExecution"],
        properties: {
          actionType: {
            type: "string",
            enum: [
              "draft_email", "draft_ad", "draft_social_post", "draft_landing_page",
              "draft_product", "send_email", "send_dm", "publish_website",
              "publish_social_post", "launch_ad", "spend_money", "change_price",
              "issue_refund", "contact_customer", "enable_live_stripe",
            ],
            description: "Category of the proposed action",
          },
          title: {
            type: "string",
            description: "Short title shown in the approval card (e.g. 'Launch Google Ad for AI writing course')",
          },
          summary: {
            type: "string",
            description: "One-sentence description of what you want to do and why",
          },
          proposedAction: {
            type: "string",
            description: "Full description of the action to be taken",
          },
          reason: {
            type: "string",
            description: "Strategic rationale — why this action is worth taking now",
          },
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Risk level: low = draft only, medium = external contact, high = spend or publish, critical = financial/legal exposure",
          },
          expectedUpside: {
            type: "string",
            description: "Best-case outcome if approved (be specific: '~$500 in sales this week')",
          },
          downside: {
            type: "string",
            description: "Worst-case outcome or risk if this goes wrong",
          },
          exactExecution: {
            type: "string",
            description: "Precise step-by-step execution plan including exact content, recipients, amounts, URLs",
          },
          estimatedCostUsd: {
            type: "number",
            description: "Estimated cost in USD if this action requires spending (0 if free)",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the web for research purposes: market data, competitor analysis, pricing benchmarks, trends, technical documentation, potential customers. Returns a list of results with titles, URLs, and snippets. Flag riskySite=true if the domain is unfamiliar or potentially low-quality.",
      parameters: {
        type: "object",
        required: ["query", "purpose"],
        properties: {
          query: {
            type: "string",
            description: "Search query string",
          },
          purpose: {
            type: "string",
            description: "Why you are searching — what decision this research supports",
          },
          riskySite: {
            type: "boolean",
            description: "Set true if results might include unvetted or risky domains. Triggers approval before using results.",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "draft_content",
      description:
        "Write a piece of content (email, ad copy, social post, landing page copy, product description, sales script) and save it to the human review queue. Nothing is sent until a human approves it. Use this freely — drafting is safe.",
      parameters: {
        type: "object",
        required: ["title", "type", "content", "destination"],
        properties: {
          title: {
            type: "string",
            description: "Short descriptive title for the draft",
          },
          type: {
            type: "string",
            enum: [
              "email_script", "ad_copy", "social_post_draft", "landing_page_copy",
              "product_description", "offer_presentation", "sales_script",
              "content_calendar", "cold_dm_script",
            ],
            description: "Type of content",
          },
          content: {
            type: "string",
            description: "Full text of the content draft",
          },
          destination: {
            type: "string",
            description: "Where this content is intended to go (e.g. 'Email list', 'Twitter/X', 'Landing page at /offer')",
          },
          previewOnly: {
            type: "boolean",
            description: "If true, this is for review only and will never be sent automatically. Default: true.",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "log_revenue",
      description:
        "Record a confirmed revenue event to the financial ledger. Only use this when a real transaction has been confirmed (e.g. Stripe payment received, invoice paid). Do NOT use for projected or hoped-for revenue.",
      parameters: {
        type: "object",
        required: ["amount", "source", "description"],
        properties: {
          amount: {
            type: "number",
            description: "Revenue amount in USD (gross, before fees)",
          },
          source: {
            type: "string",
            enum: ["stripe", "direct", "affiliate", "consulting", "ad_revenue", "other"],
            description: "Revenue source",
          },
          description: {
            type: "string",
            description: "What this revenue is from (product name, customer, campaign, etc.)",
          },
          stripeFee: {
            type: "number",
            description: "Stripe processing fee in USD (if applicable, default 0)",
          },
          businessId: {
            type: "string",
            description: "ID of the Business entity this revenue belongs to (if known)",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "log_expense",
      description:
        "Record a confirmed expense to the financial ledger. Use for actual costs incurred: API calls, hosting, ad spend, tools, etc.",
      parameters: {
        type: "object",
        required: ["amount", "category", "description"],
        properties: {
          amount: {
            type: "number",
            description: "Expense amount in USD",
          },
          category: {
            type: "string",
            enum: ["openai_api", "hosting", "marketing", "agent_labor", "tools", "other"],
            description: "Expense category",
          },
          description: {
            type: "string",
            description: "What this expense is for",
          },
          vendorName: {
            type: "string",
            description: "Name of vendor or service (e.g. 'OpenAI', 'Vercel', 'Google Ads')",
          },
          businessId: {
            type: "string",
            description: "ID of the Business entity this expense belongs to (if known)",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "post_social_media",
      description:
        "Post content directly to a social media platform. LOW/MEDIUM risk posts (general updates, tips, announcements) execute immediately. HIGH risk posts (product launches, promotions with pricing) go to the approval inbox first. Twitter/X is connected — use it freely for brand building.",
      parameters: {
        type: "object",
        required: ["platform", "content", "purpose", "riskLevel"],
        properties: {
          platform: {
            type: "string",
            enum: ["twitter", "x"],
            description: "Social platform to post on. Currently: twitter/x.",
          },
          content: {
            type: "string",
            description: "The exact text to post. Max 280 chars for Twitter. No placeholder text — write the real post.",
          },
          purpose: {
            type: "string",
            description: "Why you're posting this and what outcome you expect",
          },
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "low = general/educational content, medium = brand announcements, high = product launches or promotions with pricing",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "deploy_website",
      description:
        "Deploy a complete HTML landing page or website to Vercel. Always requires human approval before going live — this action is irreversible and public-facing. Write the full HTML including styles inline. The deployed URL will be returned after approval.",
      parameters: {
        type: "object",
        required: ["siteName", "htmlContent", "purpose"],
        properties: {
          siteName: {
            type: "string",
            description: "URL-safe name for the site (e.g. 'kids-resale-marketplace'). Lowercase, hyphens only.",
          },
          htmlContent: {
            type: "string",
            description: "Complete self-contained HTML for the page. Include all CSS inline or in a <style> tag. No external dependencies.",
          },
          purpose: {
            type: "string",
            description: "What this site is for and what business goal it serves",
          },
          estimatedRevenueImpact: {
            type: "string",
            description: "Expected business impact of deploying this page (e.g. 'capture email leads for product launch')",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "write_memory",
      description:
        "Save a memory entry to your persistent memory store. Use this to record important decisions, learnings, goals, and observations so you can recall them in future turns.",
      parameters: {
        type: "object",
        required: ["type", "content"],
        properties: {
          type: {
            type: "string",
            enum: ["observation", "decision", "learning", "goal"],
            description: "observation: something you noticed; decision: a choice you made and why; learning: something you figured out; goal: a target you're working toward",
          },
          content: {
            type: "string",
            description: "The memory content to store (be specific and actionable)",
          },
          relevance: {
            type: "number",
            description: "Importance score 1-100. Use 80+ for critical strategic facts, 50 for useful context, 20 for minor notes.",
          },
        },
      },
    },
  },
];
