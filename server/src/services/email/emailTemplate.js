/**
 * Safely escape HTML entities to prevent HTML injection / XSS in email clients
 * @param {string} str - Raw string
 * @returns {string} - Escaped safe HTML
 */
export const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Generate responsive HTML email for ticket confirmation
 */
export const generateTicketEmailHtml = ({
  buyerName,
  orderReference,
  event,
  tickets = [],
  supportEmail = 'support@eventpass.co.za'
}) => {
  const safeBuyerName = escapeHtml(buyerName || 'Valued Customer');
  const safeOrderRef = escapeHtml(orderReference || 'N/A');
  const safeEventTitle = escapeHtml(event?.title || 'Live Event');
  const safeVenue = escapeHtml(event?.venue || 'Venue to be confirmed');
  const safeLocation = escapeHtml(event?.location || 'South Africa');
  const safeDate = event?.startDateTime
    ? escapeHtml(new Date(event.startDateTime).toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }))
    : 'Date to be confirmed';

  // Build ticket cards HTML
  const ticketsHtml = tickets
    .map((t, idx) => {
      const safeTierName = escapeHtml(t.tier?.name || t.ticketType?.name || 'General Admission');
      const safeRef = escapeHtml(t.ticketReference || t.ticketCode || 'TK-UNKNOWN');
      const safeStatus = escapeHtml(t.activeStatus || t.status || 'VALID');
      const qrImgTag = t.qrDataUrl
        ? `<div style="text-align: center; margin: 16px 0;">
             <img src="${t.qrDataUrl}" alt="QR Code for ${safeRef}" style="width: 180px; height: 180px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; background: #ffffff;" />
           </div>`
        : '';

      return `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
          <div style="border-bottom: 1px dashed #cbd5e1; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #598c34; background-color: #f0fdf4; padding: 4px 10px; border-radius: 9999px;">
              ${safeStatus}
            </span>
            <span style="font-family: monospace; font-size: 12px; font-weight: 700; color: #1a2b49;">
              Ticket #${idx + 1}
            </span>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 12px;">
            <tr>
              <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Tier</td>
              <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; text-align: right;">Reference</td>
            </tr>
            <tr>
              <td style="font-size: 15px; font-weight: 800; color: #0f172a;">${safeTierName}</td>
              <td style="font-size: 15px; font-weight: 800; font-family: monospace; color: #1a2b49; text-align: right;">${safeRef}</td>
            </tr>
          </table>

          ${qrImgTag}

          <div style="text-align: center; font-size: 11px; color: #64748b; margin-top: 8px;">
            Scan this official barcode at the entrance gate turnstile.
          </div>
        </div>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your EventPass Tickets - ${safeEventTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #1a2b49; padding: 24px 32px; text-align: left;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.03em;">
                      Event<span style="color: #7fbd52;">Pass</span>
                    </span>
                    <span style="font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 4px;">.co.za</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 10px; font-weight: 800; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.1em; background: rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 9999px;">
                      Official E-Ticket
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Confirmation Hero -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: left;">
              <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #598c34; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">
                Booking Confirmed
              </span>
              <h1 style="margin: 0 0 10px 0; font-size: 26px; font-weight: 900; color: #0f172a; line-height: 1.2;">
                Your ticket is confirmed!
              </h1>
              <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">
                Hi <strong>${safeBuyerName}</strong>, your payment has been processed and your official digital entry credentials are ready.
              </p>
            </td>
          </tr>

          <!-- Event Summary Card -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="background-color: #f1f5f9; border-radius: 16px; padding: 20px;">
                <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
                  ${safeEventTitle}
                </h2>
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #334155;">
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600; width: 80px; color: #64748b;">Date & Time:</td>
                    <td style="padding: 4px 0; font-weight: 700; color: #0f172a;">${safeDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600; color: #64748b;">Venue:</td>
                    <td style="padding: 4px 0; font-weight: 700; color: #0f172a;">${safeVenue}, ${safeLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600; color: #64748b;">Order Ref:</td>
                    <td style="padding: 4px 0; font-weight: 700; font-family: monospace; color: #1a2b49;">${safeOrderRef}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Individual Tickets Section -->
          <tr>
            <td style="padding: 0 32px 16px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 800; color: #0f172a;">
                Your Passes (${tickets.length})
              </h3>
              ${ticketsHtml}
            </td>
          </tr>

          <!-- Action CTA -->
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: center;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px;">
                <p style="margin: 0 0 14px 0; font-size: 13px; color: #475569;">
                  You can also view, manage, and print your passes anytime directly in your account:
                </p>
                <a href="https://eventpass.co.za/my-tickets" style="display: inline-block; background-color: #7fbd52; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; padding: 12px 28px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 2px 4px rgba(127,189,82,0.3);">
                  View In My Tickets
                </a>
              </div>
            </td>
          </tr>

          <!-- Important Event Day Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #334155;">
                Keep this ticket available when attending the event.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                Show this barcode on your mobile device or bring a printed copy to the entrance turnstiles.
                For support, contact <a href="mailto:${supportEmail}" style="color: #598c34; text-decoration: underline;">${supportEmail}</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate plain-text email fallback for ticket confirmation
 */
export const generateTicketEmailText = ({
  buyerName,
  orderReference,
  event,
  tickets = [],
  supportEmail = 'support@eventpass.co.za'
}) => {
  const safeBuyerName = buyerName || 'Valued Customer';
  const safeOrderRef = orderReference || 'N/A';
  const safeEventTitle = event?.title || 'Live Event';
  const safeVenue = event?.venue || 'Venue to be confirmed';
  const safeLocation = event?.location || 'South Africa';
  const safeDate = event?.startDateTime
    ? new Date(event.startDateTime).toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Date to be confirmed';

  const ticketLines = tickets
    .map((t, idx) => {
      const tierName = t.tier?.name || t.ticketType?.name || 'General Admission';
      const ref = t.ticketReference || t.ticketCode || 'TK-UNKNOWN';
      const status = t.activeStatus || t.status || 'VALID';
      return `Ticket #${idx + 1}: ${tierName}\nReference: ${ref}\nStatus: ${status}\nTurnstile Barcode / QR: ${t.qrPayload || t.ticketReference}\n(Official cryptographically signed QR barcode is embedded in the HTML version of this email)`;
    })
    .join('\n\n');

  return `
============================================================
EVENTPASS — OFFICIAL E-TICKET CONFIRMATION
============================================================

Hi ${safeBuyerName},

Your payment has been processed and your official digital entry passes are confirmed!

EVENT DETAILS:
- Event: ${safeEventTitle}
- Date & Time: ${safeDate}
- Venue: ${safeVenue}, ${safeLocation}
- Order Reference: ${safeOrderRef}
- Total Passes: ${tickets.length}

YOUR PASSES:
------------------------------------------------------------
${ticketLines}
------------------------------------------------------------

ENTRY INSTRUCTIONS:
Keep this confirmation available when attending the event.
Show the barcode on your mobile device or bring a printed copy to the entrance turnstiles.

View and download your official scannable passes anytime:
https://eventpass.co.za/my-tickets

Need assistance? Contact EventPass Support at ${supportEmail}

Thank you for choosing EventPass!
============================================================
  `.trim();
};

/**
 * Generate responsive HTML email for user registration confirmation and email verification
 */
export const generateRegistrationConfirmationEmailHtml = ({
  fullName,
  email,
  verificationUrl,
  supportEmail = 'support@eventpass.co.za'
}) => {
  const safeFullName = escapeHtml(fullName || 'Valued Member');
  const safeEmail = escapeHtml(email || '');
  const safeVerificationUrl = escapeHtml(verificationUrl || '#');
  const safeSupportEmail = escapeHtml(supportEmail);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to EventPass - Confirm Your Email Address</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #1a2b49; padding: 24px 32px; text-align: left;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.03em;">
                      Event<span style="color: #7fbd52;">Pass</span>
                    </span>
                    <span style="font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 4px;">.co.za</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 10px; font-weight: 800; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.1em; background: rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 9999px;">
                      Account Confirmation
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Welcome Hero -->
          <tr>
            <td style="padding: 32px 32px 20px 32px; text-align: left;">
              <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #598c34; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">
                Welcome to EventPass
              </span>
              <h1 style="margin: 0 0 12px 0; font-size: 26px; font-weight: 900; color: #0f172a; line-height: 1.25;">
                Confirm your email address
              </h1>
              <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">
                Hi <strong>${safeFullName}</strong>, welcome to EventPass! Your account has been registered successfully.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 14px; color: #475569; line-height: 1.6;">
                To complete your registration, protect your account, and activate ticket reservations and digital gate entry, please verify your email address.
              </p>
            </td>
          </tr>

          <!-- Action Button Section -->
          <tr>
            <td style="padding: 10px 32px 28px 32px; text-align: center;">
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px 24px;">
                <p style="margin: 0 0 18px 0; font-size: 13px; font-weight: 600; color: #334155;">
                  Click the button below to confirm your account:
                </p>
                <a href="${safeVerificationUrl}" style="display: inline-block; background-color: #7fbd52; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; padding: 14px 36px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 3px 6px rgba(127,189,82,0.35);">
                  Verify Email Address
                </a>
                <p style="margin: 18px 0 0 0; font-size: 11px; color: #64748b; line-height: 1.5;">
                  This single-use verification link is valid for <strong>24 hours</strong>.
                </p>
              </div>
            </td>
          </tr>

          <!-- Plain Link Fallback -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                Having trouble with the button?
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748b; word-break: break-all; line-height: 1.5;">
                Copy and paste this URL directly into your web browser:<br />
                <a href="${safeVerificationUrl}" style="color: #598c34; text-decoration: underline;">${safeVerificationUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Account Security Notice -->
          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 14px 18px; font-size: 12px; color: #475569; line-height: 1.5;">
                <strong style="color: #0f172a;">Account Security:</strong> EventPass never requests your password or payment credentials by email. If you did not create an account with <strong>${safeEmail}</strong>, you can safely disregard this email.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #334155;">
                EventPass Ticketing Platform
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                Need help? Contact our support team anytime at <a href="mailto:${safeSupportEmail}" style="color: #598c34; text-decoration: underline;">${safeSupportEmail}</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate plain-text email fallback for user registration confirmation
 */
export const generateRegistrationConfirmationEmailText = ({
  fullName,
  email,
  verificationUrl,
  supportEmail = 'support@eventpass.co.za'
}) => {
  const safeFullName = fullName || 'Valued Member';
  const safeEmail = email || '';
  const safeVerificationUrl = verificationUrl || '';

  return `
============================================================
EVENTPASS — WELCOME & ACCOUNT REGISTRATION CONFIRMATION
============================================================

Hi ${safeFullName},

Welcome to EventPass! Your account has been registered successfully.

To complete your registration, protect your account, and activate ticket reservations and digital gate entry, please verify your email address.

VERIFY YOUR EMAIL ADDRESS:
------------------------------------------------------------
Open this link in your browser to confirm your account:
${safeVerificationUrl}
------------------------------------------------------------

NOTE:
- This single-use verification link is valid for 24 hours.
- If you did not register for an EventPass account using ${safeEmail}, please disregard this message.
- EventPass never asks for your password or payment details via email.

Need assistance? Contact EventPass Support at ${supportEmail}

Thank you for choosing EventPass!
============================================================
  `.trim();
};


