# PLAN — Schema v3 (skill side)

> **Side:** producer (skill + CLI + static viewer)
> **Companion plan (consumer side):** `~/dev/marcus/travel/docs/tasks/schema-v3.md`
> **Design spec:** `~/.claude/plans/fa-a-uma-analise-critica-lucky-hennessy.md`
> **Reference fixture:** `~/dev/marcus/travel/docs/spec/trip-v3-scheme.json`

## Context

O explor8 vai migrar de **dois JSONs publicados** (`trip` + `map`) para **um único `Trip`** com catálogo de Places + Routes no topo e `days[].schedule[]` referenciando por id. Este plan descreve o que muda no produtor:

- skill `/travel-planner` (research/build/map modes)
- CLI `x8-travel` (build/publish commands)
- viewer estático em `viewer/trip.html` (render do schedule v3, mapa com polyline encoded)

A spec compartilhada está em `~/.claude/plans/fa-a-uma-analise-critica-lucky-hennessy.md` — leia-a antes de começar qualquer fase. O exemplo canônico está em `~/dev/marcus/travel/docs/spec/trip-v3-scheme.json` e deve passar `TripSchema.safeParse()`.

**Ordem global (hard cutover — sem backfill no DB):**

Decisão operacional do founder: `TRUNCATE trips` em prod junto com o deploy v3. Italy-2026 é o único trip ativo e será **republicado fresh** em v3 pelo skill. Sem backfill, sem fork v2/v3.

1. **explor8** publica `TripSchema` v3 puro em `src/lib/schemas/trip.ts` (substitui v2 inteiramente; Phase 1 lá).
2. **Skill** (este repo) executa Phases 1–7 em paralelo — atualiza produtor, viewer, `migrateV2toV3` **local** que converte `examples/italy-2026/` v2 → v3.
3. **Lockstep deploy:** explor8 PR (schema + endpoint + render + drizzle migration `DROP COLUMN map_data` + `TRUNCATE trips`) + skill PR (v3) vão pra prod juntos.
4. Após deploy: `x8-travel publish italy-2026` republica → primeiro row v3 no DB.

Custo: legacy trips (`scotland_*`, `vegas_*`) somem da prod (nunca mais voltam até serem manualmente republicados em v3). Roadmap buffer week tinha "re-publish legacy trips" — fica adiado.

**Validação local antes do deploy:** rodar `migrateV2toV3 examples/italy-2026 > examples/italy-2026/publish.json` + abrir viewer estático → confirmar parity visual com o atual antes de mergear.

## Affected files (skill repo)

- `schema/trip.ts` — vendored canonical (drift CI mirror of explor8).
- `cli/x8-travel/build.ts` — combina `trip.json` + `map.json` → `publish.json` (Trip v3).
- `cli/x8-travel/map.ts` — KML → `routes[]` com polyline encoded; `places[]` com geo.
- `cli/x8-travel/publish.ts` — POST `{ trip: Trip }` (sem `mapData` separado).
- `skill/travel-planner/research.md` — instruções dos fetchers (picture/popularity/geo).
- `skill/travel-planner/map.md` — modo `map`: edita `places[]`/`routes[]` no doc único.
- `viewer/trip.html` — render schedule v3, decode polyline, insights item-level.
- `viewer/trip.css` — card de insights item-level (estilo "callout amarelo" do screenshot).
- `examples/italy-2026/` — trip de referência migrada para v3.
- `tools/migrate-v2-to-v3.ts` (novo) — transform script para trips existentes.
- `tests/schema-v3.test.ts` (novo) — valida fixture canônica.

## Phase 1 — Vendored schema (foundation)

**Goal:** substituir `schema/trip.ts` pelo schema v3 idêntico ao do explor8.

- Aguardar o explor8 publicar `TripSchema` em `src/lib/schemas/trip.ts` (Fase 1 do plan companheiro).
- Copiar o arquivo (`vendor-schema` script) — o schema-drift CI exige byte-identical.
- Atualizar tipos consumidores: `cli/x8-travel/*`, `viewer/trip.ts` (se houver TS) ou JSDoc no `trip.html`.

**Done when:** `pnpm test schema-v3` passa; `tsc --noEmit` no skill clean.

## Phase 2 — `x8-travel build` produz doc único

**Goal:** `cli/x8-travel build <slug>` lê `<slug>/trip.json` + `<slug>/map.json` (v2 legados) e produz `<slug>/publish.json` no formato `Trip` único.

Refactor de `build.ts`:

```ts
const tripV2 = readJSON(`${slug}/trip.json`);
const mapV2 = readJSON(`${slug}/map.json`);
const tripV3 = migrateV2toV3(tripV2, mapV2); // helper compartilhado com migrate script
const result = TripSchema.safeParse(tripV3);
if (!result.success) throw new Error(formatZodError(result.error));
writeJSON(`${slug}/publish.json`, result.data);
```

**Done when:** `x8-travel build italy-2026` gera `publish.json` válido contra schema.

## Phase 3 — Research mode fetchers

**Goal:** ensinar o skill `/travel-planner research` a popular `place.picture`, `place.popularity`, `place.geo`, `place.googlePlaceId` automaticamente.

Documentar no `skill/travel-planner/research.md`:

**Picture** — cascade (parar no primeiro hit):

1. Wikipedia REST `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` → `thumbnail.source`. Source: `wikipedia`, credit: `"Wikimedia Commons"`.
2. og:image do site oficial (fetch HTML do `links[type=official].url`, parse `<meta property="og:image">`). Source: `official`.
3. Unsplash Source API `https://source.unsplash.com/featured/?{name}` (sem auth, gratuito). Source: `unsplash`.
4. Skip se nenhum — UI fallback para emoji do `kind`.

**Popularity** — cascade:

1. Wikipedia Pageviews API `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/{title}/monthly/{from}/{to}` → soma 12 meses → `min(log10(views), 10)`.
2. Se `googlePlaceId`: Places API `(rating-1)/4 * log10(userRatingCount) * 2`.
3. Omitir.

**Geo** — cascade:

1. KML local (`<slug>/journey-map.kml`) — fonte de verdade para POIs manualmente posicionados no Google MyMaps.
2. Google Places `places.get(googlePlaceId).location` — quando placeId conhecido.
3. Google Geocoding `findPlaceFromText({input: name + city})` — $0.005/call.
4. Nominatim `nominatim.openstreetmap.org/search?q={name}` — User-Agent obrigatório (email).

**googlePlaceId** — match em modo research:

- Tentar `findPlaceFromText` com `name + city` + `locationBias` (50km do POI esperado).
- Validar: `Place.location` deve estar < 100m do `geo` (Haversine). Se não, descartar.
- Salvar `ChIJ...` em `place.googlePlaceId`.

**Done when:** rodar `/travel-planner research camping-bled` preenche `picture`/`popularity`/`googlePlaceId` no `places[]` automaticamente.

## Phase 4 — Polyline encoder

**Goal:** trocar `route.coordinates: [{lat,lng}, ...]` por `route.polyline: string` (encoded).

- Adicionar dep `@googlemaps/polyline-codec` (~3 KB, sem dep do SDK).
- Em `cli/x8-travel/map.ts` (KML parser):
  ```ts
  import { encode } from "@googlemaps/polyline-codec";
  const coords = parseKMLCoordinates(placemark); // [[lat,lng], ...]
  route.polyline = encode(coords, 5); // precision 5 = Google standard
  ```
- Remover qualquer escrita de `coordinates: [{lat,lng}]`.
- Migrate script (`tools/migrate-v2-to-v3.ts`) faz o mesmo para rotas legadas: lê `coordinates`, encode, grava `polyline`.

**Done when:** `italy-2026/publish.json` tem `routes[].polyline` (string), nenhuma `coordinates` array. Tamanho do arquivo cai ~6×.

## Phase 5 — Viewer HTML (render schedule v3)

**Goal:** `viewer/trip.html` renderiza `Trip` corretamente nas duas visões (itinerary + map).

### 5.1 — Hydration

No topo do script do viewer:

```js
const trip = await fetch(`${slug}/publish.json`).then((r) => r.json());
const placesById = new Map(trip.places.map((p) => [p.id, p]));
const routesById = new Map(trip.routes.map((r) => [r.id, r]));
```

Cada item do schedule passa por `hydrate(item)`:

```js
function hydrate(item) {
  if (item.placeId) return { ...placesById.get(item.placeId), ...item }; // override
  if (item.routeId) return { ...routesById.get(item.routeId), ...item };
  return item; // generic block
}
```

### 5.2 — Card de schedule item com insights

Cada item renderiza:

- Linha principal: emoji do `kind` + `time` + `name` (vem do place via hydrate) + chips (category, cost, popularity).
- Description: do place.
- **Insights inline:** se `item.insights[]` existe, renderizar como callout amarelo abaixo do card (replica do screenshot da Categoria 7):
  ```html
  <div class="schedule-insight">
    {#each item.insights as i} {#each i.highlights as h}
    <p class="hl">✨ {h}</p>
    {/each} {#each i.warnings as w}
    <p class="wn">⚠ {w}</p>
    {/each} {/each}
  </div>
  ```

CSS já existente para `.insight-callout` provavelmente serve com pequenos ajustes.

### 5.3 — Day-level insights

Acima do schedule do dia, renderizar `day.insights[]` (raro, opcional). Mesmo componente.

### 5.4 — Bookings com place link

Render de `<TripBookings>`: cada `booking.placeId` resolve via `placesById.get(b.placeId)` para mostrar thumbnail + nome do place clicável (foca o pin no mapa). Antes eram universos paralelos; agora reservas vivem ancoradas em places.

### 5.5 — Map view (decode polyline + filter + chips + clustering + ideas)

```js
import { decode } from "https://cdn.jsdelivr.net/npm/@googlemaps/polyline-codec/+esm";

// view.dayIndex is 0-based; URL/UI exposes Day N as 1-based (display = dayIndex + 1).
function visibleRoutes(routes, view, days) {
  if (view === "overview") return routes.filter((r) => r.mode !== "WALK");
  const dayIds = new Set(days[view.dayIndex]?.schedule.flatMap((s) => s.routeId ?? []) ?? []);
  return routes.filter((r) => dayIds.has(r.id));
}

const ROUTE_COLOR = {
  DRIVE: "#4477aa",
  WALK: "#228833",
  BICYCLE: "#88aa22",
  TRANSIT: "#aa4488",
  TRAIN: "#aa6644",
  FLIGHT: "#cc4400",
  FERRY: "#44aaff",
};

function getRouteStyle(route) {
  const base = ROUTE_COLOR[route.mode];
  const isHighlight = route.tags?.includes("highlight");
  const isScenic = route.tags?.includes("scenic");
  return {
    strokeColor: base,
    strokeWeight: isHighlight ? 5 : isScenic ? 4 : 3,
    strokeOpacity: isHighlight || isScenic ? 0.9 : 0.7,
    strokeDashArray: route.mode === "FLIGHT" ? [8, 4] : undefined,
  };
}

visibleRoutes(trip.routes, view, trip.days).forEach((r) => {
  const path = decode(r.polyline, 5).map(([lat, lng]) => ({ lat, lng }));
  new google.maps.Polyline({ path, ...getRouteStyle(r), map });
});
```

**Adições UX (paridade com explor8):**

- **Filter chips por category** (no header do mapa): `Atrações | Camping/Hotel | Comida | Mercado | Transporte`. Toggle por chip filtra `visiblePois`. Killer feature do `docs/ui/map.md`.
- **Marker clustering** via `@googlemaps/markerclusterer` CDN — reduz parede de pins em zoom out.
- **Ideas pins** — places em `places[]` que **não** aparecem em nenhum `day.schedule[].placeId` renderizam com border dashed + opacity reduzida + emoji 💡. Tooltip "ideia não agendada". Roadmap "to-be-planned space" entregue gratuitamente.
- **Polyline try/catch** — `decode()` que joga (string corrompida) loga warn e skip aquela rota, não derruba o mapa.
- **InfoWindow rico** — substitui o popup minimalista atual por card com `picture` topo + `popularity 🔥` + `description` + ações ("Ver no roteiro" scroll-to-day + "Maps ↗" via `googlePlaceId`).

**Done when:** abrir `viewer/trip.html?slug=italy-2026` localmente renderiza com chips funcionais, clusters em zoom out, 2 ideias com pin tracejado, InfoWindow rico com foto. Card de Castello mostra os insights inline como no screenshot.

## Phase 6 — Skill mode `map` (edição do catálogo único)

`/travel-planner map` em v3 edita **um arquivo só** (`<slug>/trip.json` — fonte do skill antes do build). Atualizar `skill/travel-planner/map.md`:

- Antes: "edita `<slug>/map.json` adicionando POIs/routes".
- Agora: "edita `<slug>/trip.json`, mais especificamente os arrays `places[]` e `routes[]` no topo".

Update commands `add-place`, `move-place`, `add-route` para mexer no arquivo único.

**Done when:** `/travel-planner map add-place "Restaurante X" lat lng` adiciona em `<slug>/trip.json#/places`.

## Phase 7 — Migration script + fixture italy-2026

`tools/migrate-v2-to-v3.ts`:

```ts
function migrateV2toV3(tripV2: TripV2Legacy, mapV2: MapDataV2Legacy): Trip {
  // 1. places = mapV2.pois.map(poi => ({ id, name, geo: {lat:poi.lat, lng:poi.lng}, category, kind, source, popularity, picture: poi.picture ? { url: poi.picture, source: "wikipedia" } : undefined }))
  // 2. routes = mapV2.routes.map(r => ({ id, name, mode: r.kind.toUpperCase().replace("DRIVING","DRIVE").replace("WALKING","WALK"), polyline: encode(r.coordinates.map(c => [c.lat, c.lng]), 5), duration: minutesToISO(transferMatching(r).duration), distance: km(transferMatching(r).distance) * 1000 }))
  // 3. days = tripV2.days
  //      .sort((a,b) => parseInt(a.num) - parseInt(b.num))     // v2 num determina ordem; v3 = array index
  //      .map(d => ({ title, cls, schedule: d.schedule.map(flattenItem), insights: collectFloatingInsights(d.schedule) }))
  //    flattenItem: experience → { time, placeId, cost, duration, notes, insights? }; transfer → { time, routeId }; insight → recolhido para parent item.insights ou day.insights.
  //    `num` cai (em v3, Day N = days[N-1]). Ordem do array é o único source of truth de "qual dia".
  return TripSchema.parse({ ...tripCommonFields, places, routes, days });
}
```

Rodar sobre `examples/italy-2026/` (que hoje tem v2). Output em `examples/italy-2026/publish.json`. Diff visual no viewer.

**Done when:** `examples/italy-2026/publish.json` valida em `TripSchema` E renderiza parity com a versão v2 no viewer.

## Phase 8 — Verification

```bash
# Schema
pnpm test schema-v3                              # fixture passa
tsc --noEmit                                     # tipos limpos

# Build pipeline
cd examples/italy-2026
x8-travel build italy-2026                       # gera publish.json
node -e "require('./schema/trip-v3').TripSchema.parse(require('./examples/italy-2026/publish.json'))"

# Viewer
open viewer/trip.html?slug=italy-2026            # parity visual com v2

# Drift CI
pnpm vendor-schema --check                       # par com explor8 byte-identical
```

## Companion plan

Quando este plan estiver concluído (skill produz `publish.json` v3, viewer renderiza), o explor8 pode executar `~/dev/marcus/travel/docs/tasks/schema-v3.md`:

1. Schema v3 publicado (já mirror disso).
2. Endpoint aceita Trip v3 e grava o doc inteiro em `trips.data` (coluna única; `map_data` dropada + `TRUNCATE trips` na Phase 8 do plan do explor8).
3. Render do trip page e map page atualizado.

A ordem real é hard cutover: explor8 publica schema → skill atualiza viewer/produtor → lockstep deploy (explor8 PR inclui drizzle migration `TRUNCATE trips + DROP COLUMN map_data`) → skill republica italy-2026 v3. Detalhes em `~/dev/marcus/travel/docs/tasks/schema-v3.md` §Phase 8.

## Out of scope (próxima onda no skill)

- **Google Places photo fetch** com cache no `<slug>/places/<placeId>.jpg` — reduz dependência de URLs externas (Wikimedia, Unsplash).
- **`<slug>/trip.json` editor mode no `/travel-planner map`** — UI no viewer estático que edita `places[]`/`routes[]` direto (sem precisar abrir o JSON).
- **Cross-trip places library** — mover `places[]` recorrentes (ex: "Aeroporto de Guarulhos") para um catálogo global compartilhado entre trips. Phase 3 territory.
- **Multilingual research** — quando schema ganhar `name_i18n`, fetcher precisa puxar em EN + PT-BR.
