# Payment operations

## Payment methods

Bank transfer and OPay are configured in the n8n `digital_storefront_config` table. Both currently settle to the same OPay receiving account. The account details are stored in n8n configuration and returned to the storefront by WF98; they are deliberately not duplicated in this repository.

- Supported currency: NGN.
- Methods: `bank_transfer`, `opay`.
- Verification: manual reconciliation only.
- No payment method marks an order paid when selected.
- Paystack remains disabled until its credential and payment-verification adapter are configured.

## Workflow map

| Workflow | Responsibility |
|---|---|
| WF98 — Digital Storefront Payment Methods | Public, sanitized payment instructions |
| WF99 — Digital Storefront Checkout Intake | Validates checkout, rechecks product eligibility, creates idempotent pending order/payment attempt/event |
| WF100 — Manual Payment Reconciliation | Owner-operated verification after checking the actual receiving-account transaction record |
| WF10 — Digital Delivery Eligibility Gate | Allows downstream delivery only for verified-paid orders; it does not deliver files |

## Checkout contract

Production endpoint:

`POST /webhook/digital-store/checkout/v1`

Required JSON body:

```json
{
  "product_id": "published-product-id",
  "buyer_email": "buyer@example.com",
  "payment_method": "bank_transfer",
  "idempotency_key": "UUID-v4",
  "correlation_id": "UUID-v4"
}
```

The client must not submit or control the price. WF99 reads the authoritative product row and accepts only products that are approved, QA-passed, published, have a private storage asset and non-empty file manifest, have a positive integer `price_minor`, and are priced in NGN.

A successful response creates an order in `awaiting_manual_payment` and delivery state `blocked_payment_unverified`. It returns the order reference and payment instructions. The same UUID idempotency key must be reused when retrying the same checkout request.

## Protect WF99 before enabling it

WF99 is intentionally inactive and its webhook uses Header Auth, but its credential has not yet been assigned.

1. In n8n, create a **Header Auth** credential named `Digistore Checkout Header Auth`.
2. Set header name to `x-digistore-token`.
3. Generate a strong random secret. Store it in the n8n credential and in Vercel as the sensitive environment variable `N8N_CHECKOUT_WEBHOOK_TOKEN`. Do not commit it or send it in chat.
4. Assign that credential to the `Digital Checkout Request` webhook node in WF99.
5. In Vercel project `digistore`, confirm `N8N_CHECKOUT_WEBHOOK_URL` is set to the production endpoint and add `N8N_CHECKOUT_WEBHOOK_TOKEN` for Production, Preview and Development.
6. Redeploy, then test a valid request and negative cases before publishing WF99.

The checkout API fails closed with HTTP 503 while either environment variable is missing.

## Manual payment verification

WF100 is a Manual Trigger workflow and is not a public endpoint.

1. Open `Enter Verification Details` and replace the placeholders:
   - `order_id`: order reference shown at checkout.
   - `provider_reference`: transaction reference from the actual bank/OPay transaction record.
   - `confirmed_amount_minor`: exact amount in kobo (NGN × 100).
   - `currency`: `NGN`.
   - `provider`: `opay` or `bank_transfer`, matching the order's payment attempt.
   - `decision`: `confirm`.
   - `verified_by`: operator identity.
   - `verification_note`: short reconciliation note.
2. Independently inspect the receiving account transaction history. Confirm the incoming payment, exact amount, currency and transaction reference. A customer screenshot or claim is not sufficient evidence.
3. Execute WF100 manually in the authenticated n8n editor.
4. WF100 validates the order, payment attempt, amount, currency and transaction-reference reuse before updating the order, payment attempt, transaction ledger and event ledger.

WF100 changes the order to `verified_paid` and delivery state to `pending`. It does not send a file or email. WF10 can then evaluate eligibility, but a secure storage-link and delivery adapter is still required.

## Current limitations

- There are currently no saleable products. Existing products are drafts, have incomplete assets/QA, or are test fixtures. Checkout correctly rejects them.
- WF99 has not been published because the dedicated Header Auth credential has not yet been created and assigned.
- WF100's placeholder-input negative test passed by stopping before any database read or write. A positive reconciliation test requires a real order and a real, independently verified transfer.
- Payment verification is manual; there is no OPay/bank transaction API integration.
- Automatic digital delivery is not implemented.
- Paystack is not configured.
- The latest Vercel build completed successfully, but the build reported two npm audit findings (one moderate, one high); inspect and remediate dependency advisories before treating the storefront as fully production-hardened.
