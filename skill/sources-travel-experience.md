# Travel-experience sources

Catálogo das fontes que o skill usa para pesquisar pontos de interesse, rotas, alojamento, transporte e clima. Cada source tem um slug estável (kebab-case) que aparece no enum `TravelSource` em `cli/lib/schema.ts` e no campo `source` de `Experience` e `MapPOI`.

> Convenção: o skill **sempre** prefere Tier 1 quando aplicável. Tier 2 é para viagens long-form / motorhome / trekking. Tier 3 cobre casos especializados.

> **Validação obrigatória**: antes de associar uma source a um POI, o skill abre a URL via WebFetch e confirma que o conteúdo bate com o nome/local do POI. Source não validada = não inclui.

> **Preços**: somente sites oficiais (Tier 1+ ou `official`/`website`). Blogs e artigos ficam desatualizados — não confiar.

---

## Tier 1 — Core (em toda viagem)

| Slug          | URL               | Quando usar                                                                                                           |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `google-maps` | google.com/maps   | Drive times, endereços, Street View, transit. Source-of-truth para "como chego lá".                                   |
| `booking`     | booking.com       | Inventário dominante de hotéis/apartamentos na Europa, incluindo propriedades pequenas que não listam em outro lugar. |
| `skyscanner`  | skyscanner.com    | Agregador de voos. Imbatível em multi-city + datas flexíveis.                                                         |
| `rome2rio`    | rome2rio.com      | Comparador multi-modal. Decide "trem, ônibus, voo ou carro?" em uma tela.                                             |
| `trainline`   | thetrainline.com  | Interface única para DB / SNCF / Trenitalia / Renfe / ÖBB. Evita malabarismo entre 5 sites nacionais.                 |
| `wikivoyage`  | wikivoyage.org    | Overview, do/don't, etiqueta local. Primeira leitura para região nova.                                                |
| `tripadvisor` | tripadvisor.com   | Reviews de atrações/restaurantes. Use com filtro crítico — ótimo para horários e "vale a pena ou skipo?".             |
| `wise`        | wise.com          | Cartão multi-moeda com FX baixo. Bate spread de cartão de crédito no dia-a-dia. (Revolut equivalente.)                |
| `eu-reopen`   | re-open.europa.eu | Regras de entrada por país, lógica Schengen.                                                                          |
| `etias`       | etias.com.au      | Status do rollout do ETIAS (autorização eletrônica para entrada na Schengen).                                         |

---

## Tier 2 — Long-form / motorhome / trekking

| Slug                | URL                   | Quando usar                                                                                               |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| `alltrails`         | alltrails.com         | Trilhas com reviews, elevação, download de GPX. Default para escolher trekking.                           |
| `komoot`            | komoot.com            | Planejamento multi-dia (ciclismo + hiking). Cobertura europeia melhor que AllTrails para rotas em etapas. |
| `park4night`        | park4night.com        | Pernoites de motorhome com reviews e serviços (água, elétrica, banheiro). Obrigatório para van-life.      |
| `acsi-eurocampings` | eurocampings.eu       | Campings formais pela Europa. Cartão ACSI vale desconto na baixa estação.                                 |
| `camping-info`      | camping.info          | Segunda fonte de campings. Filtros melhores para amenidades (wellness, pet-friendly).                     |
| `campercontact`     | campercontact.com     | Pontos de motorhome + info de serviços. Complementa Park4Night com dados verificados.                     |
| `meteoblue`         | meteoblue.com         | Modelo multi-regional. Melhor que serviços globais em montanha (blenda Cosmo-D2 nos Alpes).               |
| `mountain-forecast` | mountain-forecast.com | Previsão por altitude. Crítico para via ferrata e treks altos (1500/2500/3000m).                          |
| `refuges-info`      | refuges.info          | Diretório de rifúgios nos Alpes franco-italianos: datas de abertura, contatos, ocupação.                  |
| `open-meteo`        | open-meteo.com        | API de clima programática, sem key, 16 dias diário / 384h horário. Útil em script.                        |

---

## Tier 3 — Especializados

| Slug           | URL              | Quando usar                                                                            |
| -------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `getyourguide` | getyourguide.com | Ingressos skip-the-line e pré-booking para atrações populares (Vaticano, Sagrada).     |
| `tiqets`       | tiqets.com       | Forte em NL/BE.                                                                        |
| `civitatis`    | civitatis.com    | Forte em ES e LATAM.                                                                   |
| `thefork`      | thefork.com      | Reservas de restaurante na Europa, especialmente FR/ES/IT. Costuma ter promos de 30%.  |
| `frankfurter`  | frankfurter.dev  | API de conversão de moeda (taxas ECB), sem key. Para cálculo determinístico de budget. |
| `reddit`       | reddit.com       | r/europetravel, r/<país>, r/Caravanning — local color, reports recentes, gut-check.    |

---

## Catch-alls

| Slug       | Quando usar                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `official` | Site oficial do POI (museum, parque nacional, cable car, restaurante chef). Use sempre que existir e o preço/horário for confiável. |
| `website`  | Site genérico que não cai em nenhuma source acima e não é oficial mas é confiável.                                                  |
| `custom`   | User adicionou manualmente no explor8 e a fonte não tem mapeamento conhecido.                                                       |

---

## Fontes mencionadas mas fora do enum

Ferramentas que não viram POI source mas o skill usa para pesquisar. Não entram no enum `TravelSource` porque não associam a um POI específico:

- **Drone authority** — `d-flight.it` (IT), `aesa` (ES), `dgac` (FR), `lba` (DE), `caa` (UK) + regras EASA por classe — usado pelo skill para `notes` em viagens com drone.
- **Vinheta/pedágio** — `asfinag.at`, `vignette.ch`, `autopass.it`, `tolls.eu` — usado em days com Transfer driving para anotar custo.
- **Garmin Explore / Organic Maps / OsmAnd** — apps de GPS offline. Recomendar no `notes` de days off-grid.

> Estes ficam fora do enum mas o skill conhece e referencia em texto livre quando relevante.
