# Meta Pixel e Conversion API

Integração Vite/React com `scoretrack@1.0.0`, instalado pelo npmjs. O lockfile deve ser versionado junto com `package.json`.

## Configuração

Configure `VITE_META_PIXEL_ID` no build e `META_PIXEL_ID` / `META_API_ACCESS_TOKEN` nas funções da Vercel. O token real nunca recebe prefixo `VITE_` e nunca deve ser commitado. `.env.local` é ignorado pelo Git. `META_TEST_EVENT_CODE` serve para testes locais e é omitido em produção.

A versão 1.0.0 exige um ACCESS_TOKEN não vazio para inicializar o navegador: `server-side-only` é um marcador sem credencial. A autenticação real ocorre em `/api/meta/conversions`. Se a rota estiver indisponível, o fallback direto do pacote falhará por não ter token válido. O cadastro já aceito permanece concluído.

Somente `MetaPixelProvider` é montado: ele inicializa o Pixel e envia PageView. Montar também `MetaPixel` nessa versão duplicaria PageView. O envio usa os hooks `trackLead` e `trackLeadQualificado` do pacote, depois do sucesso de `/api/leads`, com score e localização devolvidos pelo servidor. A regra existente de qualificação é preservada. Pixel e CAPI compartilham o event_id criado pelo pacote.

## Validação

`MetaScrollTracking` envia o evento customizado `Scroll` em 0% ao inicializar e em 25%, 50%, 75% e 100% ao rolar para baixo. Cada marco dispara uma vez por carregamento, inclusive sob React StrictMode. O hook `trackCustomEvent` do scoretrack envia Pixel e CAPI com o mesmo event_id. Voltar ao topo e rolar novamente não repete os marcos.

`npm run test`, `npm run lint`, `npm run build`.

Validação em 15/09/2026: 26 testes passaram, TypeScript e build aprovados. Smoke test em Chromium desktop/mobile com cadastro simulado e rota real em dry-run: um PageView por carga, Lead para desqualificado e Lead + LeadQualificado para qualificado, IDs iguais entre Pixel e CAPI e nenhum erro JavaScript. Uma chamada real à Meta, com identidade fictícia e o código de teste local, retornou HTTP 200 e `events_received: 1`. O token real não está no bundle gerado. Isso confirma o recebimento do teste pela API, não a publicação da LP nem a inspeção no painel de Eventos de Teste.

O Vite puro não executa funções `api/*`. Para testar integrações locais completas, use `npx vercel dev` com o projeto e suas variáveis configurados. Para testar só a rota de conversão, envie POST com `event_name`, `event_id` e `X-VFX-Dry-Run: true`, além de Origin correspondente ao host. Os campos `dry_run`, `dryRun`, `vfx_dry_run` e `skip_webhook` também ativam a simulação.

Dry-run retorna 200 com `dry_run` e `skipped_meta`. Erros da Meta ou internos retornam 202 com `delivered: false`. Consulte `conversion_api_event_backup` e `conversion_api_event_error` nos logs do servidor; o último contém payload recebido e preparado, com credenciais removidas. Resposta 202 significa aceito para registro, não entrega confirmada à Meta; os logs de sucesso do pacote não distinguem esse caso.

O gate `scripts/lp-production-observability-check.sh` citado no pedido não existe neste repositório. A prontidão de produção depende de publicação, configuração das variáveis, confirmação em Eventos de Teste da Meta e execução do gate operacional quando disponibilizado. Build tem avisos de eval e tamanho do bundle provenientes do pacote.
