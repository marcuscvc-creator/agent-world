import { NextResponse } from "next/server";
import { sendEmailViaResend } from "@/app/lib/integrations";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendEmailViaResend({
    to: process.env.AGENT_OWNER_EMAIL ?? "mbollescvc@gmail.com",
    subject: "✅ Agent World — Email Test",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a1a;">Agent World Email Test</h2>
        <p>If you're reading this, email delivery from Agent World is working correctly.</p>
        <p>Your agents will send emails from this same pipeline when they need to reach customers, send reports, or notify you of activity.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
        <p style="color:#666;font-size:13px;">Sent from agentworld.agency · ${new Date().toISOString()}</p>
      </div>
    `,
    text: "Agent World email test — if you see this, email delivery is working.",
  });

  return NextResponse.json(result);
}
