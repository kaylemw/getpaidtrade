export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Verify webhook signature for security
    const crypto = await import('node:crypto');
    const signature = req.headers.get('x-signature');
    const hmac = crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
    const digest = hmac.update(rawBody).digest('hex');

    if (signature !== digest) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const eventName = body.meta?.event_name;

    // Only act on successful subscription creation or order completion
    if (eventName === 'subscription_created' || eventName === 'order_created') {
      const email = body.data?.attributes?.user_email || body.data?.attributes?.email;
      const name = body.data?.attributes?.user_name || body.data?.attributes?.name || '';

      if (!email) {
        return new Response(JSON.stringify({ error: 'No email found in webhook payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Generate a simple access token (in production, store this in a database
      // mapped to the email/subscription — for now using a signed token approach)
      const tokenData = `${email}:${Date.now()}`;
      const tokenHmac = crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET || process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
      const token = tokenHmac.update(tokenData).digest('hex').substring(0, 32);

      const accessUrl = `https://getpaidtrade.co.uk/contract.html?email=${encodeURIComponent(email)}&token=${token}`;

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

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
