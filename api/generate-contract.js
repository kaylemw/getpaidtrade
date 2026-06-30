export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { prompt, email, token } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'No prompt provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!email || !token) {
      return new Response(JSON.stringify({ error: 'Access denied. Missing credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the token actually exists in Upstash and matches this email,
    // rather than trusting whatever was passed in the URL. This stops a
    // forwarded link from working for anyone other than the original subscriber's
    // verified token/email pair.
    const kvCheckResponse = await fetch(`${process.env.KV_REST_API_URL}/get/token:${token}`, {
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      },
    });

    const kvData = await kvCheckResponse.json();
    const storedEmail = kvData?.result ? decodeURIComponent(kvData.result) : null;

    if (!storedEmail || storedEmail.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Access denied. Invalid or expired access link.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contract = data.content.map((b) => b.text || '').join('');

    return new Response(JSON.stringify({ contract }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  runtime: 'edge',
};
