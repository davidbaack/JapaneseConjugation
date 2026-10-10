// Public Gemini proxy for Katachiya. The Gemini key stays in Supabase project
// secrets; browser clients only call this Edge Function.

const PUBLIC_ORIGIN_OPT_IN = Deno.env.get('GEMINI_ALLOW_PUBLIC_ORIGIN') === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const MAX_BODY_BYTES = readPositiveNumber('GEMINI_MAX_BODY_BYTES', 32000);
const MAX_TEXT_CHARS = readPositiveNumber('GEMINI_MAX_TEXT_CHARS', 12000);
const MAX_OUTPUT_TOKENS = readPositiveNumber('GEMINI_MAX_OUTPUT_TOKENS', 1200);
// Pin the provider contract used below. The auto-updating Flash-Lite alias can
// move to a new model generation whose generationConfig schema is incompatible.
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_TIMEOUT_MS = 30000;

class GeminiTimeoutError extends Error {}

async function withGeminiDeadline<T>(
  req: Request,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      const error = new Error('AI request was cancelled.');
      reject(error);
      controller.abort(error);
    };
    req.signal.addEventListener('abort', cancel, { once: true });
    if (req.signal.aborted) cancel();
    timer = setTimeout(() => {
      const error = new GeminiTimeoutError('AI request timed out. Please try again.');
      reject(error);
      controller.abort(error);
    }, GEMINI_TIMEOUT_MS);
  });
  try {
    // Body streams and transports may ignore abort. The race still returns a
    // bounded response, and signal checks prevent late work from reaching Gemini.
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return run(controller.signal);
      }),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener('abort', cancel);
  }
}

const MISSING_ALLOWED_ORIGIN_ERROR =
  'Configuration Error: ALLOWED_ORIGIN is not set on the Supabase project';
const WILDCARD_ALLOWED_ORIGIN_ERROR =
  'Configuration Error: ALLOWED_ORIGIN=* requires GEMINI_ALLOW_PUBLIC_ORIGIN=true';

function readPositiveNumber(name: string, fallback: number) {
  const value = Number(Deno.env.get(name) ?? '');
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveAllowedOrigin(origin: string | null) {
  if (PUBLIC_ORIGIN_OPT_IN && ALLOWED_ORIGINS.includes('*')) return '*';
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

function corsHeaders(req: Request) {
  const allowedOrigin = resolveAllowedOrigin(req.headers.get('Origin'));
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function originConfigurationError() {
  if (ALLOWED_ORIGINS.length === 0) return MISSING_ALLOWED_ORIGIN_ERROR;
  if (!PUBLIC_ORIGIN_OPT_IN && ALLOWED_ORIGINS.includes('*')) return WILDCARD_ALLOWED_ORIGIN_ERROR;
  return '';
}

function isOriginAllowed(req: Request) {
  if (originConfigurationError()) return false;
  const origin = req.headers.get('Origin');
  return !!origin && resolveAllowedOrigin(origin) !== '';
}

function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function clientKey(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    req.headers.get('cf-connecting-ip') ||
    forwardedFor ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  );
}

async function reservePaidRequest(
  req: Request,
  payload: unknown,
  outputTokens: number,
  signal: AbortSignal,
) {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey)
    throw new Error('AI quota enforcement is unavailable. Please try again later.');
  // Daily HMACs permit shared limits without storing raw IPs or stable IP hashes.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const day = new Date().toISOString().slice(0, 10);
  const hash = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`ai-proxy-ip:v1:${day}:${clientKey(req)}`),
  );
  const clientHash = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  // Text-only input cannot reference external media. UTF-8 bytes plus a generous
  // framing allowance conservatively bound input tokens; output includes thoughts.
  const inputTokenBound = encoder.encode(JSON.stringify(payload)).byteLength + 4096;
  signal.throwIfAborted();
  const response = await fetch(`${url}/rest/v1/rpc/reserve_ai_proxy_request`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_hash: clientHash,
      client_day: day,
      input_token_bound: inputTokenBound,
      output_token_bound: outputTokens,
      model: GEMINI_MODEL,
    }),
    signal,
  });
  if (!response.ok) throw new Error('AI quota enforcement is unavailable. Please try again later.');
  const decision = await response.json();
  signal.throwIfAborted();
  if (decision?.allowed === true) return null;
  if (
    decision?.allowed !== false ||
    !['burst', 'ip_daily', 'global_daily'].includes(decision.reason) ||
    !Number.isInteger(decision.retry_after_seconds) ||
    decision.retry_after_seconds < 1
  ) {
    throw new Error('AI quota enforcement is unavailable. Please try again later.');
  }
  const message =
    decision.reason === 'global_daily'
      ? 'The shared daily AI budget has been reached. Please try again tomorrow.'
      : decision.reason === 'ip_daily'
        ? 'This network has reached its daily AI allowance. Please try again tomorrow.'
        : 'Too many AI requests in a short time. Please wait a moment and try again.';
  return jsonResponse(req, { error: message }, 429, {
    'Retry-After': String(decision.retry_after_seconds),
  });
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function countStringLeaves(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countStringLeaves(item), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + countStringLeaves(item), 0);
  }
  return 0;
}

function sanitizeGenerationConfig(value: unknown) {
  const config = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    maxOutputTokens: Math.floor(
      clampNumber(config.maxOutputTokens, 600, 1, Math.min(1200, MAX_OUTPUT_TOKENS)),
    ),
    // Gemini 3.x rejects the legacy numeric thinking budget used by 2.5.
    // Flash-Lite's minimal level preserves the low-latency coaching behavior.
    thinkingConfig: { thinkingLevel: 'MINIMAL' },
  };
}

function textContent(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const content = value as Record<string, unknown>;
  if (content.role !== undefined && !['user', 'model'].includes(String(content.role))) return null;
  if (!Array.isArray(content.parts) || content.parts.length === 0) return null;
  if (
    content.parts.some(
      (part) =>
        !part ||
        typeof part !== 'object' ||
        Array.isArray(part) ||
        Object.keys(part).some((key) => key !== 'text') ||
        typeof part.text !== 'string',
    )
  )
    return null;
  return {
    ...(content.role ? { role: String(content.role) } : {}),
    parts: content.parts.map((part) => ({ text: part.text as string })),
  };
}

type GeminiPayloadResult =
  | { error: string; status: number }
  | {
      payload: {
        contents: unknown[];
        systemInstruction: unknown;
        generationConfig: ReturnType<typeof sanitizeGenerationConfig>;
      };
    };

async function readGeminiPayload(req: Request): Promise<GeminiPayloadResult> {
  const contentLength = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: 'Request is too large', status: 413 };
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { error: 'Request is too large', status: 413 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Request body must be valid JSON', status: 400 };
  }

  const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  if (!Array.isArray(body.contents) || body.contents.length === 0) {
    return { error: 'Missing Gemini contents', status: 400 };
  }

  const contents = body.contents.map(textContent);
  const systemInstruction =
    body.systemInstruction === undefined ? undefined : textContent(body.systemInstruction);
  if (contents.some((content) => !content) || systemInstruction === null) {
    return { error: 'Only text AI requests are supported.', status: 400 };
  }

  const textChars = countStringLeaves(contents) + countStringLeaves(systemInstruction);
  if (textChars > MAX_TEXT_CHARS) {
    return { error: 'Prompt is too large', status: 413 };
  }

  return {
    payload: {
      contents,
      systemInstruction,
      generationConfig: sanitizeGenerationConfig(body.generationConfig),
    },
  };
}

Deno.serve(async (req) => {
  const originError = originConfigurationError();
  if (originError) {
    return jsonResponse(req, { error: originError }, 500);
  }

  if (req.method === 'OPTIONS') {
    return new Response(isOriginAllowed(req) ? 'ok' : 'forbidden', {
      status: isOriginAllowed(req) ? 200 : 403,
      headers: corsHeaders(req),
    });
  }

  if (!isOriginAllowed(req)) {
    return jsonResponse(req, { error: 'Origin is not allowed' }, 403);
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405, { Allow: 'POST, OPTIONS' });
  }

  try {
    return await withGeminiDeadline(req, async (signal) => {
      const apiKey = Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) {
        return jsonResponse(
          req,
          { error: 'Configuration Error: GEMINI_API_KEY is not set on the Supabase project' },
          500,
        );
      }

      const result = await readGeminiPayload(req);
      signal.throwIfAborted();
      if ('error' in result) {
        return jsonResponse(req, { error: result.error }, result.status);
      }

      let denial: Response | null;
      try {
        denial = await reservePaidRequest(
          req,
          result.payload,
          result.payload.generationConfig.maxOutputTokens,
          signal,
        );
      } catch {
        signal.throwIfAborted();
        return jsonResponse(
          req,
          { error: 'AI quota enforcement is unavailable. Please try again later.' },
          503,
        );
      }
      if (denial) return denial;
      signal.throwIfAborted();

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result.payload),
        signal,
      });

      const data = await response.json();
      signal.throwIfAborted();
      if (!response.ok) {
        return jsonResponse(
          req,
          { error: data.error?.message || `Gemini API returned HTTP ${response.status}` },
          response.status,
        );
      }

      return jsonResponse(req, data, 200);
    });
  } catch (err) {
    return jsonResponse(
      req,
      { error: err instanceof Error ? err.message : 'An unexpected server error occurred' },
      err instanceof GeminiTimeoutError ? 504 : 500,
    );
  }
});
