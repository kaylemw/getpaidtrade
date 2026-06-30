export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { email, name, trade, amount } = body;

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send welcome email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'GetPaidTrade <hello@getpaidtrade.co.uk>',
        to: email,
        subject: 'Your late payment letter is ready 💰',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #111111;">
            
            <div style="margin-bottom: 32px;">
              <span style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">GetPaid<span style="color: #F5C400;">Trade</span></span>
            </div>

            <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 16px; line-height: 1.2;">
              Your letter is ready${name ? `, ${name.split(' ')[0]}` : ''}.
            </h1>

            <p style="font-size: 16px; color: #444444; line-height: 1.7; margin-bottom: 24px;">
              We've just generated your professional late payment demand letter${amount ? ` for <strong>£${parseFloat(amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong>` : ''}. Head back to the site to copy or print it.
            </p>

            <div style="background: #F9F9F9; border-left: 4px solid #F5C400; padding: 20px 24px; margin-bottom: 32px; border-radius: 0 8px 8px 0;">
              <p style="font-size: 14px; color: #555555; margin: 0; line-height: 1.6;">
                <strong style="color: #111111;">Quick tip:</strong> Send the letter via email AND post if you can. A physical letter in an envelope gets taken far more seriously than a text or WhatsApp message.
              </p>
            </div>

            <p style="font-size: 16px; color: #444444; line-height: 1.7; margin-bottom: 8px;">
              <strong>Want to protect your next job before it starts?</strong>
            </p>
            <p style="font-size: 15px; color: #444444; line-height: 1.7; margin-bottom: 32px;">
              We're building a contract generator specifically for UK tradespeople — watertight terms that protect your payment from day one. We'll let you know the moment it's ready.
            </p>

            <a href="https://getpaidtrade.co.uk" style="display: inline-block; background: #F5C400; color: #111111; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin-bottom: 40px;">
              Back to GetPaidTrade →
            </a>

            <hr style="border: none; border-top: 1px solid #EEEEEE; margin-bottom: 24px;" />

            <p style="font-size: 12px; color: #999999; line-height: 1.6;">
              You're receiving this because you used the free letter generator at getpaidtrade.co.uk. We'll only email you when we have something genuinely useful for you.
              <br/>GetPaidTrade is not a law firm. Letters generated are templates and do not constitute legal advice.
            </p>

          </div>
        `,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend error:', resendData);
      // Don't fail the whole request if email fails — still return success
      // so the user gets their letter
    }

    // Also add to Resend contacts/audience
    await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        first_name: name ? name.split(' ')[0] : '',
        unsubscribed: false,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Subscribe error:', err);
    // Still return success — don't block letter generation if email capture fails
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
