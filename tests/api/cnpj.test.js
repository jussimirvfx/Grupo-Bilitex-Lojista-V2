import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import handler from '../../api/cnpj.js';
import { isSameOrigin } from '../../api/_lib/same-origin.js';
import { formatCNPJ, isValidCNPJ, normalizeCNPJ } from '../../src/lib/cnpj.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const createResponse = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const createRequest = (cnpj) => ({
  method: 'GET',
  query: { cnpj },
  headers: {
    host: 'grupo-bilitex-lojista-v2.vercel.app',
    origin: 'https://grupo-bilitex-lojista-v2.vercel.app',
    'sec-fetch-site': 'same-origin',
    'x-forwarded-for': '192.0.2.21',
    'x-vercel-oidc-token': 'test-oidc-token',
  },
});

test('valida, normaliza e formata CNPJ localmente', () => {
  assert.equal(normalizeCNPJ('60.887.522/0001-89'), '60887522000189');
  assert.equal(formatCNPJ('60887522000189'), '60.887.522/0001-89');
  assert.equal(isValidCNPJ('60.887.522/0001-89'), true);
  assert.equal(isValidCNPJ('60.887.522/0001-88'), false);
  assert.equal(isValidCNPJ('11.111.111/1111-11'), false);
});

test('rejeita CNPJ inválido sem chamar a API central', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('não deveria consultar'); };
  const response = createResponse();

  await handler(createRequest('60.887.522/0001-88'), response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.cnpj_validation_status, 'invalid');
  assert.equal(calls, 0);
});

test('encaminha CNPJ válido para a API central com OIDC e identidade V2', async () => {
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return new Response(JSON.stringify({
      cnpj: '60887522000189',
      cnpj_valido: true,
      encontrado: true,
      fonte: 'SINTEGRA',
      motivo: '',
      fontes_consultadas: ['SINTEGRA'],
      cnpj_validation_status: 'cadastral_valid',
      company: { razao_social: 'Empresa Fictícia Ltda' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const response = createResponse();

  await handler(createRequest('60.887.522/0001-89'), response);

  assert.equal(response.statusCode, 200);
  assert.equal(forwarded.url, 'https://validador-cnpj.vfxaceleradordevendas.com.br/api/v1/cnpj');
  assert.equal(forwarded.options.method, 'POST');
  assert.equal(forwarded.options.headers.Authorization, 'Bearer test-oidc-token');
  assert.equal(forwarded.options.headers['X-VFX-Landing-ID'], 'grupo-bilitex-lojista-v2');
  assert.deepEqual(JSON.parse(forwarded.options.body), { cnpj: '60887522000189' });
});

test('aceita somente requisições same-origin', () => {
  assert.equal(isSameOrigin(createRequest('60.887.522/0001-89')), true);
  assert.equal(isSameOrigin({
    headers: {
      host: 'grupo-bilitex-lojista-v2.vercel.app',
      origin: 'https://example.com',
      'sec-fetch-site': 'cross-site',
    },
  }), false);
  assert.equal(isSameOrigin({ headers: { host: 'grupo-bilitex-lojista-v2.vercel.app' } }), false);
});
