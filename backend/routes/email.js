/**
 * Email routes — powered by MailerSend API v1
 * All emails sent from: consignment@youthnic.shop
 * API docs: https://developers.mailersend.com/api/v1/email
 */
const express = require('express');
const https   = require('https');
const router  = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { addAuditLog } = require('../utils/helpers');

const API_KEY    = () => process.env.MAILERSEND_API_KEY || '';
const FROM_EMAIL = () => process.env.MAIL_FROM_EMAIL   || 'consignment@youthnic.shop';
const FROM_NAME  = () => process.env.MAIL_FROM_NAME    || 'Youthnic Packing Station';
const DOMAIN     = () => process.env.MAIL_USER_DOMAIN  || 'youthnic.shop';
const APP_URL    = () => process.env.APP_URL            || 'http://localhost:5173';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/** "Pawan Shukla" → "pawan@youthnic.shop" */
function nameToEmail(name) {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${first}@${DOMAIN()}`;
}

/** POST to MailerSend /v1/email */
function sendViaMailerSend(payload) {
  return new Promise((resolve, reject) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const options = {
      hostname: 'api.mailersend.com',
      path:     '/v1/email',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY()}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 202 Accepted = success for MailerSend
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`MailerSend error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ─── Welcome email template ─────────────────────────────────────────────── */
function buildWelcomeEmail(name, email, password, role) {
  const loginUrl   = `${APP_URL()}/login`;
  const firstName  = name.split(' ')[0];
  const mappedEmail = nameToEmail(name);
  const permLabel  = role === 'admin' ? 'Administrator (full access)' : 'Standard User';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Youthnic</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px 16px 0 0;padding:32px;text-align:center">
          <p style="margin:0;font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">Youthnic</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.65);letter-spacing:1px;text-transform:uppercase">Packing Station</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:36px 40px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a">Welcome, ${firstName}! 👋</p>
          <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.6">
            Your account has been created on the <strong>Youthnic Packing Station</strong>. Use the credentials below to sign in.
          </p>

          <!-- Credentials box -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
            style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px">
            <tr><td style="padding:20px 24px">
              <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8">Your Login Credentials</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:12px;color:#64748b;width:110px">Full Name</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a">${name}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:12px;color:#64748b">Login Email</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#4f46e5;font-family:monospace">${email}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:12px;color:#64748b">Password</td>
                  <td style="padding:6px 0">
                    <span style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:3px 10px;font-family:monospace;font-size:13px;font-weight:700;color:#92400e;letter-spacing:1px">${password}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:12px;color:#64748b">Role</td>
                  <td style="padding:6px 0;font-size:12px;color:#0f172a">${permLabel}</td>
                </tr>
                ${mappedEmail ? `<tr>
                  <td style="padding:6px 0;font-size:12px;color:#64748b">System Email</td>
                  <td style="padding:6px 0;font-size:12px;color:#6366f1;font-family:monospace">${mappedEmail}</td>
                </tr>` : ''}
              </table>
            </td></tr>
          </table>

          <!-- CTA button -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
            <tr><td align="center">
              <a href="${loginUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(79,70,229,.35)">
                Sign In to Packing Station →
              </a>
            </td></tr>
          </table>

          <!-- Security warning -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
            style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin-bottom:24px">
            <tr><td style="padding:14px 18px">
              <p style="margin:0;font-size:12px;color:#c2410c">
                <strong>⚠️ Security:</strong> Please change your password after your first login. Never share your credentials with anyone.
              </p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">
            If you did not expect this email or have any questions, contact your system administrator at
            <a href="mailto:${FROM_EMAIL()}" style="color:#4f46e5">${FROM_EMAIL()}</a>.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            © ${new Date().getFullYear()} Youthnic Exports Pvt. Ltd. · Packing Station v2.0
            <br>This is an automated message — please do not reply directly.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Welcome to Youthnic Packing Station, ${firstName}!

Your account has been created. Here are your login credentials:

  Name:       ${name}
  Email:      ${email}
  Password:   ${password}
  Role:       ${permLabel}
  Login URL:  ${loginUrl}

Please change your password after your first login.

© ${new Date().getFullYear()} Youthnic Exports Pvt. Ltd.`;

  return { html, text };
}

/* ─── Routes ─────────────────────────────────────────────────────────────── */

/**
 * POST /api/email/send
 * Generic send — admin only
 */
router.post('/send', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { to, toName, subject, html, text } = req.body;
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ error: 'to, subject, and html/text are required.' });
    }
    if (!API_KEY()) {
      return res.status(503).json({ error: 'MAILERSEND_API_KEY not set in .env' });
    }

    await sendViaMailerSend({
      from:    { email: FROM_EMAIL(), name: FROM_NAME() },
      to:      [{ email: to, name: toName || to }],
      subject,
      html:    html || `<p>${text}</p>`,
      text:    text || ''
    });

    await addAuditLog('email_sent', 'email', to, req.user.id, { subject });
    res.json({ ok: true, to, subject });
  } catch (err) {
    console.error('[Email] Send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/welcome
 * Send welcome credentials email to a new user — called internally from users.js
 * Body: { name, email, password, role }
 */
router.post('/welcome', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password are required.' });
    }
    if (!API_KEY()) {
      console.warn('[Email] MAILERSEND_API_KEY not set — skipping welcome email');
      return res.json({ ok: false, reason: 'Email not configured' });
    }

    const { html, text } = buildWelcomeEmail(name, email, password, role || 'user');
    const subject = `Welcome to Youthnic Packing Station — Your Login Details`;

    await sendViaMailerSend({
      from:    { email: FROM_EMAIL(), name: FROM_NAME() },
      to:      [{ email, name }],
      subject, html, text
    });

    await addAuditLog('welcome_email_sent', 'user', email, req.user.id, { name, role });
    console.log(`[Email] Welcome email sent to ${email}`);
    res.json({ ok: true, to: email });
  } catch (err) {
    console.error('[Email] Welcome email error:', err.message);
    // Don't fail user creation if email fails
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/email/notify-consignment
 * Packing event notification — sent to user's mapped email
 */
router.post('/notify-consignment', authenticateToken, async (req, res) => {
  try {
    const { consignmentId, internalShipmentNo, event, recipientName } = req.body;
    if (!API_KEY()) return res.json({ ok: false, reason: 'Email not configured' });

    const senderName = recipientName || req.user.name || req.user.email;
    const toEmail    = nameToEmail(senderName);
    if (!toEmail) return res.status(400).json({ error: 'Cannot resolve email from name' });

    const labels = {
      box_saved:             'Box Saved',
      consignment_finished:  'Consignment Completed',
      consignment_created:   'Consignment Created',
    };
    const eventLabel = labels[event] || event;
    const subject    = `[Youthnic] ${eventLabel} — ${internalShipmentNo || consignmentId}`;

    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:20px 28px;border-radius:12px 12px 0 0">
        <p style="margin:0;font-size:16px;font-weight:800;color:#fff">Youthnic Packing Station</p>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0f172a">Hi ${senderName.split(' ')[0]},</p>
        <p style="margin:0 0 20px;color:#64748b;font-size:13px">A packing event occurred:</p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden">
          <tr><td style="padding:10px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Event</td>
              <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#4f46e5;border-bottom:1px solid #e2e8f0">${eventLabel}</td></tr>
          <tr><td style="padding:10px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Consignment</td>
              <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0">${internalShipmentNo || consignmentId}</td></tr>
          <tr><td style="padding:10px 16px;font-size:12px;color:#64748b">Time</td>
              <td style="padding:10px 16px;font-size:13px;color:#0f172a">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:11px;color:#94a3b8">Automated notification · Do not reply</p>
      </div>
    </div>`;

    await sendViaMailerSend({
      from: { email: FROM_EMAIL(), name: FROM_NAME() },
      to:   [{ email: toEmail, name: senderName }],
      subject, html
    });

    await addAuditLog('email_notification', 'consignment', consignmentId, req.user.id, { event, toEmail });
    res.json({ ok: true, to: toEmail });
  } catch (err) {
    console.error('[Email] Notification error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/resolve-address?name=Pawan Shukla
 */
router.get('/resolve-address', authenticateToken, (req, res) => {
  const { name } = req.query;
  res.json({ name, email: nameToEmail(name), domain: DOMAIN() });
});

module.exports = router;
