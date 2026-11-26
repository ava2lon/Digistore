import { NextResponse } from "next/server";

export async function GET() {
  const endpoint = process.env.N8N_PAYMENT_METHODS_URL;
  if (!endpoint) {
    return NextResponse.json({ error: "Payment methods are not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(endpoint, {
      headers: process.env.N8N_API_TOKEN ? { Authorization: `Bearer ${process.env.N8N_API_TOKEN}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: "Payment methods are temporarily unavailable." }, { status: 502 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Payment methods are temporarily unavailable." }, { status: 502 });
  }
}
