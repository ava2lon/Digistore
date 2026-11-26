import { NextRequest, NextResponse } from "next/server";

const allowedMethods = new Set(["bank_transfer", "opay"]);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const hook = process.env.N8N_CHECKOUT_WEBHOOK_URL;
  const token = process.env.N8N_CHECKOUT_WEBHOOK_TOKEN;

  // Fail closed until the n8n webhook is protected by the matching Header Auth credential.
  if (!hook || !token) {
    return NextResponse.json(
      { error: "Checkout is not enabled yet. The protected order endpoint is not fully configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const productId = typeof data.product_id === "string" ? data.product_id.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const paymentMethod = typeof data.payment_method === "string" ? data.payment_method : "";
  const idempotencyKey = typeof data.idempotency_key === "string" ? data.idempotency_key.toLowerCase() : "";

  if (
    !productId ||
    productId.length > 128 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    !allowedMethods.has(paymentMethod) ||
    !uuidV4.test(idempotencyKey)
  ) {
    return NextResponse.json(
      { error: "Provide a valid product, email, payment method and checkout idempotency key." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(hook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-digistore-token": token,
      },
      body: JSON.stringify({
        product_id: productId,
        buyer_email: email,
        payment_method: paymentMethod,
        idempotency_key: idempotencyKey,
        correlation_id: idempotencyKey,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const result = await response.json().catch(() => ({
      error: "The order service returned an unreadable response.",
    }));
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "Order service is temporarily unavailable. Retry using the same checkout session." },
      { status: 502 },
    );
  }
}
