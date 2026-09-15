import { createHash } from 'node:crypto';
import { isSameOrigin } from '../_lib/same-origin.js';

const enabled = value => value === true || value === 1 || ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
const hash = value => /^[a-f0-9]{64}$/i.test(value)
  ? value.toLowerCase() : createHash('sha256').update(value).digest('hex');

// Redact credentials even when they arrive nested in a payload or error string.
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, /token|authorization|secret/i.test(key) ? '[REDACTED]' : redact(item),
    ]));
  }
  if (typeof value === 'string') {
    const token = process.env.META_API_ACCESS_TOKEN;
    return (token ? value.replaceAll(token, '[REDACTED]') : value)
      .replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]');
  }
  return value;
}

export function prepareMetaPayload(body, req) {
  const user = body.user_data || {};
  const userData = {};
  for (const key of ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id']) {
    if (user[key] == null) continue;
    userData[key] = (Array.isArray(user[key]) ? user[key] : [user[key]])
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean).map(value => {
        if (/^[a-f0-9]{64}$/i.test(value)) return hash(value);
        if (key === 'ph' || key === 'zp') value = value.replace(/\D/g, '');
        if (['fn', 'ln', 'ct', 'st', 'country'].includes(key)) {
          value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
        }
        return hash(value);
      });
  }
  for (const key of ['fbp', 'fbc']) if (user[key]) userData[key] = String(user[key]);
  userData.client_user_agent = req.headers?.['user-agent'] || user.client_user_agent;
  userData.client_ip_address = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || undefined;
  const payload = { data: [{
    event_name: body.event_name,
    event_id: body.event_id,
    event_time: Number.isFinite(body.event_time) ? body.event_time : Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: body.event_source_url,
    user_data: userData,
    custom_data: redact(body.custom_data || {}),
  }] };
  if (process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production' && process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSameOrigin(req)) return res.status(403).json({ error: 'origin-not-allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'invalid-json' }); }
  if (!body || !['PageView', 'Lead', 'LeadQualificado', 'Scroll'].includes(body.event_name)
    || typeof body.event_id !== 'string' || !body.event_id.trim()) {
    return res.status(400).json({ error: 'invalid-event' });
  }
  let prepared = null;
  const context = {
    project: process.env.VERCEL_PROJECT_NAME || 'grupo-bilitex-lojista-v2',
    route: '/api/meta/conversions', received_at: new Date().toISOString(),
    request_id: req.headers?.['x-vercel-id'] || req.headers?.['x-request-id'] || null,
    event_name: body.event_name, event_id: body.event_id,
  };
  const logError = details => console.error(JSON.stringify(redact({
    level: 'error', event: 'conversion_api_event_error', ...context,
    request_payload: body, prepared_meta_payload: prepared, ...details,
  })));
  try {
    const dryRun = enabled(req.headers?.['x-vfx-dry-run'])
      || ['dry_run', 'dryRun', 'vfx_dry_run', 'skip_webhook'].some(key => enabled(body[key]));
    console.info(JSON.stringify(redact({
      level: 'info', event: 'conversion_api_event_backup', ...context,
      custom_data: body.custom_data || {}, dry_run: dryRun,
      user_data_presence: Object.fromEntries(Object.entries(body.user_data || {}).map(([key, value]) => [key, Boolean(value)])),
    })));
    prepared = prepareMetaPayload(body, req);
    if (dryRun) return res.status(200).json({ accepted: true, dry_run: true, skipped_meta: true });
    const token = process.env.META_API_ACCESS_TOKEN;
    const pixelId = process.env.META_PIXEL_ID;
    if (!token || !pixelId) throw new Error('meta-server-not-configured');
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(prepared), signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      logError({ msg: 'meta-api-error', meta_status: response.status, meta_error: result });
      return res.status(202).json({ accepted: true, delivered: false });
    }
    return res.status(200).json({ accepted: true, delivered: true, events_received: result.events_received });
  } catch (error) {
    logError({ msg: 'conversion-api-error', error_message: error?.message || 'unknown-error' });
    return res.status(202).json({ accepted: true, delivered: false });
  }
}
