// Public Gemini proxy for Katachiya. The Gemini key stays in Supabase project
// secrets; browser clients only call this Edge Function.

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const MAX_BODY_BYTES = readPositiveNumber('GEMINI_MAX_BODY_BYTES', 32000)
const MAX_TEXT_CHARS = readPositiveNumber('GEMINI_MAX_TEXT_CHARS', 12000)
const MAX_OUTPUT_TOKENS = readPositiveNumber('GEMINI_MAX_OUTPUT_TOKENS', 1200)
const RATE_LIMIT_BURST = readPositiveNumber('GEMINI_RATE_LIMIT_BURST', 10)
const RATE_LIMIT_REFILL_MS = readPositiveNumber('GEMINI_RATE_LIMIT_REFILL_MS', 6000)

type Bucket = {
  tokens: number
  updatedAt: number
}

const buckets = new Map<string, Bucket>()

function readPositiveNumber(name: string, fallback: number) {
  const value = Number(Deno.env.get(name) ?? '')
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function resolveAllowedOrigin(origin: string | null) {
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin
  return ALLOWED_ORIGINS[0] ?? ''
}

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(req.headers.get('Origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function isOriginAllowed(req: Request) {
  const origin = req.headers.get('Origin')
  return !origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)
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
  })
}

function clientKey(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    req.headers.get('cf-connecting-ip') ||
    forwardedFor ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  )
}

function cleanupBuckets(now: number) {
  if (buckets.size < 1000) return
  const maxAge = RATE_LIMIT_REFILL_MS * RATE_LIMIT_BURST * 2
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > maxAge) buckets.delete(key)
  }
}

function rateLimitRetryAfterMs(req: Request) {
  const now = Date.now()
  const key = clientKey(req)
  const bucket = buckets.get(key) ?? { tokens: RATE_LIMIT_BURST, updatedAt: now }
  const elapsed = Math.max(0, now - bucket.updatedAt)

  bucket.tokens = Math.min(RATE_LIMIT_BURST, bucket.tokens + elapsed / RATE_LIMIT_REFILL_MS)
  bucket.updatedAt = now

  if (bucket.tokens < 1) {
    buckets.set(key, bucket)
    return Math.ceil((1 - bucket.tokens) * RATE_LIMIT_REFILL_MS)
  }

  bucket.tokens -= 1
  buckets.set(key, bucket)
  cleanupBuckets(now)
  return 0
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function countStringLeaves(value: unknown): number {
  if (typeof value === 'string') return value.length
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countStringLeaves(item), 0)
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + countStringLeaves(item), 0)
  }
  return 0
}

function sanitizeGenerationConfig(value: unknown) {
  const config = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    maxOutputTokens: Math.floor(
      clampNumber(config.maxOutputTokens, 600, 1, MAX_OUTPUT_TOKENS),
    ),
    temperature: clampNumber(config.temperature, 0.7, 0, 1),
    thinkingConfig: { thinkingBudget: 0 },
  }
}

async function readGeminiPayload(req: Request) {
  const contentLength = Number(req.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: 'Request is too large', status: 413 }
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) {
    return { error: 'Request is too large', status: 413 }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Request body must be valid JSON', status: 400 }
  }

  const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const contents = body.contents
  if (!Array.isArray(contents) || contents.length === 0) {
    return { error: 'Missing Gemini contents', status: 400 }
  }

  const textChars = countStringLeaves(contents) + countStringLeaves(body.systemInstruction)
  if (textChars > MAX_TEXT_CHARS) {
    return { error: 'Prompt is too large', status: 413 }
  }

  return {
    payload: {
      contents,
      systemInstruction: body.systemInstruction,
      generationConfig: sanitizeGenerationConfig(body.generationConfig),
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(isOriginAllowed(req) ? 'ok' : 'forbidden', {
      status: isOriginAllowed(req) ? 200 : 403,
      headers: corsHeaders(req),
    })
  }

  if (!isOriginAllowed(req)) {
    return jsonResponse(req, { error: 'Origin is not allowed' }, 403)
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405, { Allow: 'POST, OPTIONS' })
  }

  const retryAfterMs = rateLimitRetryAfterMs(req)
  if (retryAfterMs > 0) {
    return jsonResponse(
      req,
      { error: 'Too many AI requests in a short time. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
    )
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return jsonResponse(
        req,
        { error: 'Configuration Error: GEMINI_API_KEY is not set on the Supabase project' },
        500,
      )
    }

    const result = await readGeminiPayload(req)
    if ('error' in result) {
      return jsonResponse(req, { error: result.error }, result.status)
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result.payload),
    })

    const data = await response.json()
    if (!response.ok) {
      return jsonResponse(
        req,
        { error: data.error?.message || `Gemini API returned HTTP ${response.status}` },
        response.status,
      )
    }

    return jsonResponse(req, data, 200)
  } catch (err) {
    return jsonResponse(
      req,
      { error: err instanceof Error ? err.message : 'An unexpected server error occurred' },
      500,
    )
  }
})
