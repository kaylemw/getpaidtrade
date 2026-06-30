import crypto from 'node:crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody);

    // Verify webhook signature for security
    const signature = req.headers['x-signature'];
    const hmac = crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
    const digest = hmac.update(rawBody).digest('hex');

    if (signature !== digest) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const eventName = body.meta?.event_name;

    // Only act on subscription_created. LemonSqueezy fires both
    // order_created and subscription_created for the same purchase,
    // which previously caused two duplicate access link emails.
    // subscription_created is the more accurate event for what we sell.
    if (eventName === 'subscription_created') {
      // LemonSqueezy puts customer email under attributes.user_email
      const email = body.data?.attributes?.user_email;
      const name = body.data?.attributes?.user_name || '';

      if (!email) {
        console.error('No email found in payload:', JSON.stringify(body.data?.attributes));
        return res.status(400).json({ error: 'No email found in webhook payload' });
      }

      // Generate a unique access token
      const tokenData = `${email}:${Date.now()}`;
      const tokenHmac = crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET || process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
      const token = tokenHmac.update(tokenData).digest('hex').substring(0, 32);

      // Store the token in Upstash, mapped to this email, so it can be verified
      // on every contract generation rather than trusted blindly from the URL.
      // Set to expire in 400 days — long enough to outlast any annual subscription
      // without requiring renewal logic, short enough to eventually clean up unused tokens.
      const kvResponse = await fetch(`${process.env.KV_REST_API_URL}/set/token:${token}/${encodeURIComponent(email)}/EX/34560000`, {
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        },
      });

      if (!kvResponse.ok) {
        console.error('Failed to store access token in Upstash');
        // Don't block the email send — but log this so it's visible if it happens
      }

      const accessUrl = `https://www.getpaidtrade.co.uk/contract.html?email=${encodeURIComponent(email)}&token=${token}`;

      // Send magic link email via Resend
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'GetPaidTrade <hello@getpaidtrade.co.uk>',
          to: email,
          subject: 'Your access link — GetPaidTrade Pro 🔑',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #111111;">
              <div style="margin-bottom: 32px;">
                <span style="font-size: 24px; font-weight: 900;">GetPaid<span style="color: #F5C400;">Trade</span></span>
              </div>
              <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 16px; line-height: 1.2;">
                You're in${name ? `, ${name.split(' ')[0]}` : ''}.
              </h1>
              <p style="font-size: 16px; color: #444444; line-height: 1.7; margin-bottom: 24px;">
                Thanks for subscribing to GetPaidTrade Pro. Click below to access your contract generator — no password needed, this link is your access.
              </p>
              <a href="${accessUrl}" style="display: inline-block; background: #F5C400; color: #111111; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin-bottom: 32px;">
                Access Contract Generator →
              </a>
              <p style="font-size: 13px; color: #999999; line-height: 1.6;">
                Bookmark this email — you'll need this link each time you want to generate a new contract.
              </p>
              <hr style="border: none; border-top: 1px solid #EEEEEE; margin: 24px 0;" />
              <p style="font-size: 12px; color: #999999; line-height: 1.6;">
                GetPaidTrade is not a law firm. Contracts generated are templates and do not constitute legal advice.
              </p>
            </div>
          `,
        }),
      });
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
