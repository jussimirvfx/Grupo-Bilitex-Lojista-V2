import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import handler, { prepareMetaPayload } from '../../api/meta/conversions.js';
import { trackAcceptedLead } from '../../src/lib/metaLead.js';

const original = { fetch: globalThis.fetch, info: console.info, error: console.error };
const originalEnv = { ...process.env };
let logs;
let calls;
const event = () => ({ event_name: 'Lead', event_id: 'synthetic-lead-1',
  user_data: { em: 'test@example.com', ph: '+55 (47) 99999-9999' }, custom_data: { lead_score: 0 } });
const req = body => ({ method: 'POST', body, headers: {
  host: 'localhost:3000', origin: 'http://localhost:3000', 'user-agent': 'test-browser',
} });
const res = () => ({ statusCode: 200, setHeader() {}, end() {},
  status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
beforeEach(() => {
  logs = []; calls = [];
  console.info = console.error = entry => logs.push(JSON.parse(entry));
  process.env.META_PIXEL_ID = '2163459471255680';
  process.env.META_API_ACCESS_TOKEN = 'synthetic-secret';
  globalThis.fetch = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ events_received: 1 }) }; };
});
afterEach(() => {
  globalThis.fetch = original.fetch; console.info = original.info; console.error = original.error;
  for (const key of ['META_PIXEL_ID', 'META_API_ACCESS_TOKEN', 'META_TEST_EVENT_CODE', 'NODE_ENV', 'VERCEL_ENV']) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});
test('all dry-run aliases skip Meta and preserve score zero in the backup', async () => {
  for (const flag of ['dry_run', 'dryRun', 'vfx_dry_run', 'skip_webhook', 'header']) {
    const request = req({ ...event(), [flag]: true });
    if (flag === 'header') request.headers['x-vfx-dry-run'] = 'true';
    const response = res(); await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.skipped_meta, true);
    assert.equal(response.body.dry_run, true);
  }
  assert.equal(calls.length, 0);
  assert.ok(logs.every(log => log.custom_data.lead_score === 0));
});
test('backup precedes delivery, hashes PII and keeps event ID', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(logs[0].event, 'conversion_api_event_backup');
    const data = JSON.parse(options.body).data[0];
    assert.equal(data.event_id, 'synthetic-lead-1');
    assert.match(data.user_data.em[0], /^[a-f0-9]{64}$/);
    assert.equal(data.custom_data.lead_score, 0);
    return { ok: true, json: async () => ({ events_received: 1 }) };
  };
  const response = res(); await handler(req(event()), response);
  assert.equal(response.body.delivered, true);
});
test('existing hashes are not hashed again and production omits test code', () => {
  process.env.NODE_ENV = 'production'; process.env.META_TEST_EVENT_CODE = 'TEST';
  const body = event(); body.user_data.em = ['a'.repeat(64)];
  const result = prepareMetaPayload(body, req(body));
  assert.equal(result.data[0].user_data.em[0], 'a'.repeat(64));
  assert.equal(result.test_event_code, undefined);
});
test('Meta errors return 202 with recoverable payloads and redacted secrets', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'synthetic-secret' } }) });
  const body = { ...event(), access_token: 'another-secret' };
  const response = res(); await handler(req(body), response);
  assert.equal(response.statusCode, 202);
  const log = logs.find(log => log.event === 'conversion_api_event_error');
  assert.equal(log.request_payload.event_id, body.event_id);
  assert.ok(log.prepared_meta_payload.data[0].user_data.em);
  assert.ok(!JSON.stringify(logs).includes('synthetic-secret'));
  assert.ok(!JSON.stringify(logs).includes('another-secret'));
});
test('network and missing configuration failures return accepted 202', async () => {
  globalThis.fetch = async () => { throw new Error('timeout'); };
  for (const missing of [false, true]) {
    if (missing) delete process.env.META_API_ACCESS_TOKEN;
    const response = res(); await handler(req(event()), response);
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.delivered, false);
  }
  assert.equal(logs.filter(log => log.event === 'conversion_api_event_error').length, 2);
});
test('invalid JSON, event, method and cross-origin requests do not send', async () => {
  for (const [request, status] of [[req('{'), 400], [req({}), 400],
    [{ ...req(event()), method: 'GET' }, 405], [{ ...req(event()), headers: {} }, 403]]) {
    const response = res(); await handler(request, response); assert.equal(response.statusCode, status);
  }
  assert.equal(calls.length, 0);
});
test('accepted leads use server qualification and preserve zero score', async () => {
  const form = { contactName: 'Teste', email: 'test@example.com', whatsapp: '(47) 99999-9999' };
  for (const qualified of [false, true, undefined]) {
    const sent = [];
    await trackAcceptedLead(form, { qualified, lead_score: 0, value: 0 }, {
      trackLead: async data => sent.push(['Lead', data]),
      trackLeadQualificado: async data => sent.push(['LeadQualificado', data]),
    });
    assert.deepEqual(sent.map(([name]) => name), qualified ? ['Lead', 'LeadQualificado'] : ['Lead']);
    assert.equal(sent[0][1].lead_score, 0); assert.equal(sent[0][1].value, 0);
  }
});
test('tracking failure does not reject an accepted form', async () => {
  console.error = () => {};
  await assert.doesNotReject(trackAcceptedLead({ whatsapp: '47999999999' }, {}, {
    trackLead: async () => { throw new Error('offline'); },
  }));
});
