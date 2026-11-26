"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

type Product = { product_id: string; name: string; price_minor: number; currency: string };
type PaymentMethod = {
  method: "bank_transfer" | "opay";
  display_name: string;
  currency: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  instructions: string;
};
type CheckoutResult = {
  ok: true;
  order_id: string;
  payment_reference: string;
  order_status: string;
  payment_status: string;
  amount_minor: number;
  currency: string;
  payment: PaymentMethod;
  notice: string;
};

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amountMinor / 100);
}

export default function CheckoutForm({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState<"bank_transfer" | "opay">("bank_transfer");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/catalog", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/payment-methods", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([catalog, paymentConfig]) => {
        if (cancelled) return;
        setProduct(catalog.products?.find((item: Product) => item.product_id === productId) || null);
        const available = Array.isArray(paymentConfig.methods) ? paymentConfig.methods : [];
        setMethods(available);
        if (available.length && !available.some((item: PaymentMethod) => item.method === method)) {
          setMethod(available[0].method);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Checkout information is temporarily unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !methods.some((item) => item.method === method) || result) return;
    setBusy(true);
    setMessage("");
    if (!idempotencyKey.current) idempotencyKey.current = window.crypto.randomUUID();

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.product_id,
          email,
          payment_method: method,
          idempotency_key: idempotencyKey.current,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout could not be started.");
      setResult(data as CheckoutResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ padding: "42px 0 90px", maxWidth: 720 }}>
      <Link href="/" className="muted">← Continue shopping</Link>
      <h1 className="serif" style={{ fontSize: 48, fontWeight: 500 }}>Checkout</h1>

      {product ? (
        result ? (
          <section className="card" style={{ padding: 26, display: "grid", gap: 14 }}>
            <div className="eyebrow">Order created · Awaiting payment</div>
            <h2 className="serif" style={{ fontSize: 30, fontWeight: 500 }}>Complete your transfer</h2>
            <p className="muted" style={{ fontSize: 13 }}>Order reference</p>
            <strong style={{ fontSize: 18, letterSpacing: ".04em" }}>{result.payment_reference}</strong>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <p style={{ margin: "4px 0" }}>Amount: <strong>{money(result.amount_minor, result.currency)}</strong></p>
              <p style={{ margin: "4px 0" }}>Method: <strong>{result.payment.display_name}</strong></p>
              <p style={{ margin: "4px 0" }}>Bank / wallet: <strong>{result.payment.bank_name}</strong></p>
              <p style={{ margin: "4px 0" }}>Account name: <strong>{result.payment.account_name}</strong></p>
              <p style={{ margin: "4px 0" }}>Account number: <strong>{result.payment.account_number}</strong></p>
            </div>
            <p style={{ background: "#f0f3ee", padding: 14, fontSize: 13, lineHeight: 1.6 }}>{result.payment.instructions}</p>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{result.notice}</p>
            <p style={{ fontSize: 13 }}><strong>Current status:</strong> Awaiting manual payment verification. Your download will not be released until the payment is confirmed.</p>
          </section>
        ) : (
          <form className="card" onSubmit={submit} style={{ padding: 26, display: "grid", gap: 18 }}>
            <div>
              <div className="eyebrow">Your selection</div>
              <h2>{product.name}</h2>
              <strong>{money(product.price_minor, product.currency)}</strong>
            </div>

            <label style={{ display: "grid", gap: 7, fontSize: 13 }}>
              Email address
              <input required type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>

            <div>
              <strong style={{ fontSize: 13 }}>Choose payment method</strong>
              {product.currency !== "NGN" ? (
                <p className="muted" style={{ fontSize: 13 }}>Bank transfer and OPay checkout currently support NGN-priced products only.</p>
              ) : methods.length ? (
                <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
                  {methods.map((item) => (
                    <label key={item.method} className="card" style={{ padding: 14, display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="radio" checked={method === item.method} onChange={() => setMethod(item.method)} name="method" />
                      {item.display_name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>Payment options are not available at the moment.</p>
              )}
            </div>

            <button className="btn" disabled={busy || !methods.length || product.currency !== "NGN"}>
              {busy ? "Creating order…" : "Place order"}
            </button>
            {message && <p role="status" style={{ background: "#f0f3ee", padding: 14, fontSize: 13 }}>{message}</p>}
            <p className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
              A transfer screenshot or customer claim does not prove settlement. Never share your PIN, OTP or banking password.
            </p>
          </form>
        )
      ) : (
        <div className="card" style={{ padding: 28 }}>Product unavailable or not yet published.</div>
      )}
    </main>
  );
}
