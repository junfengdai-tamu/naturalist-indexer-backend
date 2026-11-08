const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_SECONDS = 15;

export function groqError(message, statusCode, options) {
  const error = new Error(message, options);
  error.statusCode = statusCode;
  return error;
}

function retryAfterSeconds(response, attempt) {
  const header = Number.parseFloat(response.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? Math.ceil(header) : 2 ** (attempt + 1);
}

// Sends a JSON-mode chat completion to Groq and returns the parsed JSON object.
// Rate limits (429) are retried when Groq says the wait is short, otherwise surfaced as 429.
export async function groqJsonCompletion({ messages, temperature, maxCompletionTokens }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw groqError('GROQ_API_KEY is not configured', 503);

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature,
          reasoning_effort: 'low',
          reasoning_format: 'hidden',
          max_completion_tokens: maxCompletionTokens,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      throw groqError('Could not reach Groq API', 502, { cause });
    }

    if (response.status === 429) {
      const waitSeconds = retryAfterSeconds(response, attempt);
      if (attempt < MAX_RATE_LIMIT_RETRIES && waitSeconds <= MAX_RETRY_WAIT_SECONDS) {
        console.warn(`Groq rate limit reached; retrying in ${waitSeconds}s`);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }
      const error = groqError('Groq rate limit reached; retry shortly', 429);
      error.retryAfterSeconds = waitSeconds;
      throw error;
    }

    if (!response.ok) {
      console.error(`Groq API returned ${response.status}: ${await response.text()}`);
      throw groqError('Groq API request failed', 502);
    }

    try {
      const payload = await response.json();
      return JSON.parse(payload.choices?.[0]?.message?.content);
    } catch (cause) {
      console.error('Could not parse Groq response:', cause);
      throw groqError('Groq returned an invalid response', 502);
    }
  }
}
