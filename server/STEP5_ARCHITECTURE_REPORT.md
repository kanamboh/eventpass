# EventPass Step 5 — Payment Processing & Reconciliation Architecture Report

## 1. Executive Summary & Status
Step 5 implements the payment processing foundation and authoritative server-side payment reconciliation for EventPass. The implementation enforces strict security baselines (OWASP ASVS Level 2, OWASP API Security Top 10), financial integrity invariants, and decoupled provider architecture.

### Scope & Invariant Summary
- **Catalogue & Base Currency**: Kept strictly as South African Rand (**ZAR**). Event/ticket database prices remain in ZAR.
- **Provider Abstraction**: Decoupled interface [`PaymentProvider`](./src/services/payment/PaymentProvider.js) with production [`PaystackProvider`](./src/services/payment/PaystackProvider.js) and test/simulation [`MockPaymentProvider`](./src/services/payment/MockPaymentProvider.js).
- **Paystack Regional Currency Constraints**: Safely handled with configuration/business error (`422 CURRENCY_NOT_SUPPORTED_BY_MERCHANT`) if an account (e.g., Kenyan merchant entity) attempts to process ZAR without a South African entity or server-side FX layer.
- **Late Payment / Inventory Race Condition**: Mitigated with the new authoritative reconciliation state `PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED`. Over-selling is impossible; customer payment remains audited and recoverable.
- **Webhook Security**: Cryptographic HMAC-SHA512 verification against unmodified raw HTTP byte buffers using constant-time comparison.
- **Out of Scope (Preserved)**: Ticket generation, QR codes, email notifications, ticket scanning, check-in, refunds, and admin payment dashboard remain unimplemented.

---

## 2. Threat Model & Mitigation Matrix

| Threat / Attack Vector | Severity | Vulnerability Description | EventPass Mitigation |
| :--- | :--- | :--- | :--- |
| **BOLA / IDOR on Payment Initialization** | High | Attacker initializes or verifies payment against another customer's order. | Validates session ownership (`order.userId === req.user.id`). BOLA access attempts return `403 ORDER_ACCESS_DENIED`. |
| **Financial / Price Tampering** | Critical | Client injects modified `amount`, `currency`, `subtotal`, or exchange rates in request body. | Zod schemas strictly strip unauthorized fields. All payment calculations draw authoritatively from PostgreSQL `orders.totalMinor` and `orders.currency`. |
| **Provider Amount / Currency Mismatch** | Critical | Payment gateway webhook or redirect reports tampered or spoofed amount/currency. | Server performs independent verification asserting `providerData.amountMinor === order.totalMinor` and `providerData.currency === order.currency`. Mismatches trigger immediate rejection with `AMOUNT_MISMATCH` or `CURRENCY_MISMATCH`. |
| **Kenya Account ZAR Incompatibility** | High | Kenyan Paystack accounts only support KES and USD natively. Direct ZAR submission would fail at gateway or corrupt catalogue currency. | System enforces explicit currency support check. If the configured merchant cannot natively charge ZAR, request fails safely with `422 CURRENCY_NOT_SUPPORTED_BY_MERCHANT` without changing the catalogue currency. |
| **Expired Order / Late Payment Race** | Critical | Customer completes payment on Paystack after order expires, while inventory was re-allocated to another buyer. | PostgreSQL transaction with `FOR UPDATE` row locks checks inventory. If unallocated inventory is insufficient, system marks Payment `SUCCESS` (auditable for refunds) but transitions Order to `PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED` and increments zero tickets. |
| **Webhook Forgery / Signature Bypass** | Critical | Attacker delivers fake `charge.success` webhook payloads to mark orders as paid without paying. | Cryptographic HMAC-SHA512 validation over unmodified `req.rawBody` bytes using `crypto.timingSafeEqual`. Unequal signature lengths fail safely before buffer comparison. |
| **Webhook Replay / Concurrency Double-Spend** | High | Duplicate or simultaneous delivery of the same webhook payload triggers multiple order processing passes. | Database unique constraint on `WebhookEvent.providerEventId` (`PAYSTACK_${event}_${transactionId}`). Duplicates trigger PostgreSQL `P2002` conflict and are acknowledged idempotently without re-executing order fulfillment. |
| **CSRF Bypass on Webhooks** | Medium | Browser CSRF protection blocking valid server-to-server webhook deliveries from Paystack. | `verifyOrigin` middleware bypasses `/webhook` endpoints, relying exclusively on cryptographic HMAC-SHA512 signatures. |
| **Predictable Payment References** | Medium | Sequential or guessable references allowing enumeration of merchant transactions. | References generated via cryptographically random 24-character hexadecimal values: `EP-<24-HEX-DIGITS>` (e.g. `EP-0562834C4DBC9BB093945230`) with a DB unique constraint. |

---

## 3. Currency Architecture: ZAR Catalogue vs Regional Paystack Constraints

### Official Paystack Regional Rules
- **Kenya Entity (`KE`)**: Supports **KES** and **USD** only.
- **South Africa Entity (`ZA`)**: Supports **ZAR** natively.

### Architectural Policy
1. **EventPass Catalogue Display Currency**: Strictly **ZAR**.
2. **Database Pricing**: All ticket tier prices and order totals stored as integer cents in **ZAR**.
3. **No Silent Conversions**: The system NEVER silently converts ZAR to KES or USD.
4. **Provider Capability Validation**:
   - `PaystackProvider.isCurrencySupported(currency)` queries the merchant country capabilities.
   - For South African accounts (`merchantCountry: 'ZA'`), ZAR is natively accepted.
   - For Kenyan accounts (`merchantCountry: 'KE'`), ZAR is rejected with:
     ```json
     {
       "status": "error",
       "code": "CURRENCY_NOT_SUPPORTED_BY_MERCHANT",
       "message": "Payment provider does not support order currency: ZAR. Native ZAR requires a South African merchant account or active server-side FX conversion."
     }
     ```
5. **Future FX Architecture (Prepared Interface)**:
   - If international payments are introduced, conversion must occur exclusively server-side.
   - Conversion rate, source amount (ZAR), and converted settlement amount/currency (`settlementAmountMinor`, `settlementCurrency`, `fxRate`) are stored immutably on the `Payment` record.
   - Clients are strictly barred from providing exchange rates or converted amounts.

---

## 4. Critical State Machine & Invariant Preservation

### Order Status State Machine
- `PENDING` -> `PAYMENT_PROCESSING`: Initialized
- `PAYMENT_PROCESSING` -> `PAID`: Payment verified & inventory available
- `PAYMENT_PROCESSING` -> `PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED`: Late payment confirmed after inventory reallocated
- `PAYMENT_PROCESSING` -> `PENDING`: Payment failed or abandoned

### Invariant Equations Enforced
1. **Total Inventory Guarantee**:
   $$\text{quantitySold} + \text{quantityReserved} \le \text{quantityTotal}$$
2. **Active Hold Consistency**:
   $$\text{quantityReserved} = \sum_{\text{status}=\text{ACTIVE} \land \text{expiresAt} > \text{NOW}()} \text{quantity}$$
3. **Auditability Guarantee**:
   All settled funds without ticket fulfillment have `Payment.status = SUCCESS` and `Order.status = PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED`.

---

## 5. Webhook Architecture & Middleware Pipeline

- Raw byte buffer preserved in `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`
- HMAC-SHA512 with `crypto.timingSafeEqual`
- Deterministic event ID: `PAYSTACK_${event}_${data.id || data.reference}`
- Unique DB constraint on `WebhookEvent.providerEventId`

---

## 6. Automated Regression & Payment Security Test Results

All test suites executed against local PostgreSQL (`eventpass_dev`):

| Test Suite | Purpose | Tests Run | Result |
| :--- | :--- | :---: | :---: |
| `test_auth_security.js` | Authentication, session fixation, OWASP password rules, email verification | 38 | **38 / 38 PASS** |
| `test_events_api.js` | Event catalog, slug resolution, pagination limits, inventory calculations | 20 | **20 / 20 PASS** |
| `test_reservations_orders.js` | Reservations, order conversions, concurrency race tests | 26 | **26 / 26 PASS** |
| `test_reservations_security.js` | OWASP ASVS L2, PostgreSQL null-idempotency matrix, multi-user isolation | 44 | **44 / 44 PASS** |
| `test_payments.js` | Payment security, BOLA, amount tampering, Kenya/ZAR check, HMAC, late-race | 34 | **34 / 34 PASS** |
| **Total Automated Tests** | **Comprehensive Full-Stack Backend Baseline** | **162** | **162 / 162 PASS (100%)** |
| **Frontend Production Build** | `vite build` compilation & asset bundling | — | **0 Errors (Success)** |

---

## 7. Security Notice & Scope Boundaries
- **No Claims of Zero Vulnerabilities**: In alignment with engineering guidelines, this system does not claim absolute zero vulnerabilities or final production certification without complete third-party penetration testing and live merchant gateway provisioning.
- **Strictly Out of Scope for Step 5**: Ticket PDF/pass generation, QR barcode signing, email delivery, barcode check-in, automated refunds, and administrative payment consoles remain out of scope and untouched.
