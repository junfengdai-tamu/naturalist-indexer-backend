const BASE_URL = 'https://chat.tamu.ai/api';
const MODEL = 'protected.Claude Sonnet 4.5';
const TEMPERATURE = 1.0;
const MAX_TOKENS = 16384;
const DELAY_SECONDS = 1.0;
const RETRIES = 3;

export function tamuError(message, statusCode, options) {
  const error = new Error(message, options);
  error.statusCode = statusCode;
  return error;
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function retryAfterSeconds(response, attempt) {
  const header = Number.parseFloat(response.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? Math.ceil(header) : DELAY_SECONDS * 2 ** attempt;
}

// Models may wrap JSON in markdown fences or add prose around it.
function parseJsonContent(content) {
  const text = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  }
}

// Sends a chat completion to TAMU AI and returns the parsed JSON object.
// Temperature and max tokens are fixed above; the caller's values are ignored.
export async function tamuJsonCompletion({ messages }) {
  const apiKey = process.env.TAMU_API_KEY;
  if (!apiKey) throw tamuError('TAMU_API_KEY is not configured', 503);

  // TAMU AI sits behind Cloudflare Access; CF_COOKIE is either the full Cookie header or a bare CF_Authorization token.
  const cookie = process.env.CF_COOKIE;
  const cookieHeader = cookie && (cookie.includes('=') ? cookie : `CF_Authorization=${cookie}`);

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(cookieHeader && { Cookie: cookieHeader }),
        },
        body: JSON.stringify({ model: MODEL, temperature: TEMPERATURE, max_tokens: MAX_TOKENS, stream: false, messages }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (cause) {
      if (attempt < RETRIES) {
        await sleep(DELAY_SECONDS);
        continue;
      }
      throw tamuError('Could not reach TAMU AI API', 502, { cause });
    }

    if (response.status === 429) {
      const waitSeconds = retryAfterSeconds(response, attempt);
      if (attempt < RETRIES) {
        console.warn(`TAMU AI rate limit reached; retrying in ${waitSeconds}s`);
        await sleep(waitSeconds);
        continue;
      }
      const error = tamuError('TAMU AI rate limit reached; retry shortly', 429);
      error.retryAfterSeconds = waitSeconds;
      throw error;
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < RETRIES) {
        await sleep(DELAY_SECONDS);
        continue;
      }
      console.error(`TAMU AI API returned ${response.status}: ${await response.text()}`);
      throw tamuError('TAMU AI API request failed', 502);
    }

    try {
      const payload = await response.json();
      return parseJsonContent(payload.choices?.[0]?.message?.content);
    } catch (cause) {
      console.error('Could not parse TAMU AI response:', cause);
      throw tamuError('TAMU AI returned an invalid response', 502);
    }
  }
}
