import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";
import { sendSlackPreviewMessage } from "@/app/lib/integrations";
import type { PreviewItem } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ previewItems: [], error: "Database not connected." }, { status: 424 });
  }

  const previewItems = await prisma.previewItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { agent: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ previewItems });
}

export async function POST(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ error: "Database not connected." }, { status: 424 });
  }

  const body = (await request.json()) as { previewItemId: string; holdRequested?: boolean };

  const preview = await prisma.previewItem.findUnique({
    where: { id: body.previewItemId },
    include: { agent: { select: { id: true, name: true } } },
  });

  if (!preview) {
    return NextResponse.json({ error: "Preview item not found." }, { status: 404 });
  }

  if (body.holdRequested) {
    const updated = await prisma.previewItem.update({
      where: { id: body.previewItemId },
      data: { holdRequested: true },
    });
    return NextResponse.json({
      previewItem: updated,
      result: { ok: true, mode: "sandbox", message: "HOLD received. Agent work paused for this preview." },
    });
  }

  const previewShape: PreviewItem = {
    id: preview.id,
    agentId: preview.agentId,
    agentName: preview.agent?.name ?? "Unknown Agent",
    title: preview.title,
    type: preview.type.toLowerCase() as PreviewItem["type"],
    content: preview.content,
    destination: preview.destination,
    previewOnly: preview.previewOnly,
    holdRequested: preview.holdRequested,
  };

  const result = await sendSlackPreviewMessage(previewShape);

  if (result.ok) {
    await prisma.previewItem.update({
      where: { id: body.previewItemId },
      data: { sentToSlackAt: new Date() },
    });
  }

  return NextResponse.json({ previewItem: preview, result });
}
