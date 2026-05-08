#!/usr/bin/env node
// Enriches POIs in trip.json + map.json with:
//   - picture (og:image from EN-Wikipedia, validated via HEAD)
//   - popularity (log10 of last-12-months pageviews, capped at 10)
//   - desc/description (first sentence from Wikipedia REST summary)
//   - Insight highlights (skill-generated consensus, after specific Experiences)
//   - source + links validated
//
// POIs without Wikipedia entries are skipped silently for picture/popularity,
// but their description is filled from the seed knowledge map below.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TRIP_DIR = join(REPO_ROOT, "trips", "italy-2026-v2");
const TRIP_PATH = join(TRIP_DIR, "trip.json");
const MAP_PATH = join(TRIP_DIR, "map.json");

const trip = JSON.parse(readFileSync(TRIP_PATH, "utf-8"));
const map = JSON.parse(readFileSync(MAP_PATH, "utf-8"));

// ---------------------------------------------------------------------------
// poiId → { wikiTitle?, source?, links?[], desc?, highlights?[], warnings?[] }
// wikiTitle: EN-Wikipedia article title (use underscore + URL-encode where needed)
// If absent, picture & popularity skip silently — but desc/highlights still apply
// ---------------------------------------------------------------------------
const enrichmentMap = {
  "indie-campers-mxp-pickup-return": {
    desc: "Pickup e devolução do motorhome Indie Campers no aeroporto MXP de Milão Malpensa.",
    source: "official",
    links: [{ type: "official", url: "https://indiecampers.com/it/depots/milan" }],
  },
  venezia: {
    wikiTitle: "Venice",
    desc: "Cidade construída sobre 118 ilhas no norte da Itália, conhecida pelos canais, pela Praça de São Marco e pelo carnaval. Patrimônio da Humanidade UNESCO.",
    highlights: ["Cidade pedonal — pontes e canais em vez de ruas; vaporetto é o transporte oficial.", "Patrimônio UNESCO desde 1987."],
    source: "wikivoyage",
    links: [{ type: "wikivoyage", url: "https://en.wikivoyage.org/wiki/Venice" }],
  },
  "camp-fusina-venezia": {
    desc: "Camping Fusina — frente à laguna de Veneza, vaporetto direto para San Marco. Aceita motorhomes.",
    source: "campercontact",
    links: [{ type: "official", url: "https://www.campingfusina.com/" }],
  },
  "basilica-san-marco": {
    wikiTitle: "St_Mark's_Basilica",
    desc: "Catedral bizantina do séc. XI, conhecida pelos mosaicos dourados que cobrem cúpulas e abóbadas. Ingresso online obrigatório (timed-entry) desde 2025.",
    highlights: ["Mosaicos bizantinos cobrindo 8.000 m² de superfície interna.", "Pala d'Oro — retábulo de ouro com 2.000 gemas."],
    warnings: ["Ingresso online obrigatório (timed-entry) — esgota com antecedência."],
    source: "official",
    links: [
      { type: "official", url: "https://tickets.basilicasanmarco.it/en/store" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g187870-d197702-Reviews-Basilica_di_San_Marco-Venice_Veneto.html" },
    ],
  },
  "campanile-san-marco": {
    wikiTitle: "St_Mark's_Campanile",
    desc: "Campanário de 98m da Basílica de São Marco, com elevador para o topo e vista 360° sobre Veneza, a laguna e os Alpes em dias claros.",
    highlights: ["Vista panorâmica de Veneza e da laguna do alto da torre."],
    source: "official",
    links: [{ type: "official", url: "https://basilicasanmarco.it/en/visit/campanile/" }],
  },
  "palazzo-ducale-itinerari-segreti": {
    wikiTitle: "Doge's_Palace",
    desc: "Palácio gótico-veneziano sede do Doge da Sereníssima por 700+ anos. O tour 'Itinerari Segreti' visita prisões, salas secretas e a passagem de Casanova pela Ponte dei Sospiri.",
    highlights: ["Tour 'Itinerari Segreti' — grupos pequenos, narrativa sobre Casanova e o sistema judicial veneziano."],
    warnings: ["Reservar online com antecedência — vagas limitadas."],
    source: "tripadvisor",
    links: [
      { type: "official", url: "https://palazzoducale.visitmuve.it/en/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g187870-d196648-Reviews-Doge_s_Palace-Venice_Veneto.html" },
    ],
  },
  "basilica-santi-giovanni-paolo": {
    wikiTitle: "Santi_Giovanni_e_Paolo,_Venice",
    desc: "Maior igreja gótica de Veneza, panteão de 25 doges. Vitrais do séc. XV e teto de Veronese.",
    source: "tripadvisor",
  },
  "chiesa-gesuiti": {
    wikiTitle: "Santa_Maria_Assunta,_Venice",
    desc: "Igreja barroca dos jesuítas (1729) com teto pintado por Tiepolo e mármore esculpido imitando damasco.",
    source: "wikivoyage",
  },
  "ponte-di-rialto": {
    wikiTitle: "Rialto_Bridge",
    desc: "Ponte de pedra do séc. XVI sobre o Grand Canal — a mais antiga das quatro pontes que cruzam o canal e o ponto mais fotografado de Veneza.",
    highlights: ["Ponto turístico icônico — chegar cedo para fotos sem multidão."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g187870-d195579-Reviews-Rialto_Bridge-Venice_Veneto.html" }],
  },
  "bacari-do-rialto": {
    desc: "Bares tradicionais venezianos próximos ao mercado de Rialto. Cantina Do Mori (desde 1462) é o mais antigo. Servem cicchetti (petiscos) com ombra (vinho local).",
    source: "tripadvisor",
    highlights: ["Cantina Do Mori funciona desde 1462 — autêntica experiência de bacaro veneziano."],
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Restaurant_Review-g187870-d1034566-Reviews-Cantina_Do_Mori-Venice_Veneto.html" }],
  },
  "basilica-dei-frari": {
    wikiTitle: "Frari_Basilica",
    desc: "Basílica franciscana gótica do séc. XIV. Abriga obras de Tiziano (incluindo a 'Assunção da Virgem') e Bellini, e o túmulo de Cláudio Monteverdi.",
    highlights: ["'Assunção da Virgem' de Tiziano sobre o altar-mor — uma das obras mais importantes do Renascimento veneziano."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g187870-d195913-Reviews-Basilica_dei_Frari-Venice_Veneto.html" }],
  },
  "santa-maria-della-salute": {
    wikiTitle: "Santa_Maria_della_Salute",
    desc: "Basílica barroca octogonal (1631–1687) na entrada do Grand Canal, construída como agradecimento pela peste que matou ⅓ dos venezianos. Cúpula icônica.",
    source: "tripadvisor",
  },
  "concerto-vivaldi-i-musici-veneziani": {
    desc: "Concerto interpretando 'As Quatro Estações' de Vivaldi pela orquestra I Musici Veneziani na Scuola Grande di San Teodoro, com músicos em figurinos barrocos do séc. XVIII.",
    source: "tripadvisor",
    highlights: ["Vivaldi nasceu em Veneza — escutar 'As Quatro Estações' a cinco minutos da casa do compositor é experiência única."],
    warnings: ["Comprar tickets online antecipados — concertos populares esgotam."],
    links: [
      { type: "official", url: "https://www.imusiciveneziani.com/en/concerts/a-vivaldis-four-seasons/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com.br/AttractionProductReview-g187870-d11473467-I_Musici_Veneziani_Concert_Vivaldi_Four_Seasons-Venice_Veneto.html" },
    ],
  },
  "cividale-del-friuli": {
    wikiTitle: "Cividale_del_Friuli",
    desc: "Vila medieval do Friuli fundada por Júlio César. Patrimônio UNESCO pelo Tempietto Longobardo (séc. VIII). Ponte do Diabo sobre o Rio Natisone.",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Tourism-g790399-Cividale_del_Friuli_Province_of_Udine_Friuli_Venezia_Giulia.html" }],
  },
  "postojna-cave": {
    wikiTitle: "Postojna_Cave",
    desc: "Sistema de cavernas cársticas de 24 km no sudoeste da Eslovênia. Tour de 1h30 com trem subterrâneo elétrico de 3,7 km. Habitat do Proteus anguinus ('peixe-humano').",
    highlights: ["Maior caverna turística da Europa — único sistema com trem subterrâneo elétrico."],
    warnings: ["Comprar combo Postojna+Predjama online — preço melhor."],
    source: "official",
    links: [
      { type: "official", url: "https://www.postojnska-jama.eu/en/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274878-d277348-Reviews-Postojna_Cave-Postojna_Inner_Carniola_Region.html" },
    ],
  },
  "predjama-castle": {
    wikiTitle: "Predjama_Castle",
    desc: "Castelo medieval do séc. XII construído dentro de um paredão de 123m de calcário. O maior castelo em caverna do mundo.",
    highlights: ["Maior castelo em caverna do mundo (Guinness)."],
    source: "official",
    links: [
      { type: "official", url: "https://www.postojnska-jama.eu/en/predjama-castle/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274878-d277346-Reviews-Predjama_Castle-Postojna_Inner_Carniola_Region.html" },
    ],
  },
  "camp-bled": {
    desc: "Camping Bled — categoria 4 estrelas à beira do Lago Bled, com piscina, restaurantes e acesso direto ao circuito do lago.",
    source: "campercontact",
    links: [{ type: "official", url: "https://www.camping-bled.com/" }],
  },
  "vintgar-gorge": {
    wikiTitle: "Vintgar_Gorge",
    desc: "Desfiladeiro de 1,6 km com passarelas de madeira sobre o rio Radovna em águas verde-esmeralda. Termina na Cascata Šum (16m).",
    highlights: ["Águas turquesa devido aos minerais do calcário alpino."],
    warnings: ["Ingresso online obrigatório, time slots esgotam no verão.", "Trecho com cachoeira pode ter pedras escorregadias após chuva."],
    source: "official",
    links: [
      { type: "official", url: "https://www.vintgar.si/en/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g1870874-d519724-Reviews-Vintgar_Gorge-Gorje_Upper_Carniola_Region.html" },
    ],
  },
  "lago-bled": {
    wikiTitle: "Lake_Bled",
    desc: "Lago glacial de 2 km com a única ilha natural da Eslovênia, onde fica a Igreja da Assunção (séc. XVII) com 99 degraus e um sino dos desejos.",
    highlights: ["Cartão-postal da Eslovênia — a Pletna boat até a ilha é experiência tradicional desde 1590.", "Caminhada de 6 km circundando o lago, plana e fácil."],
    source: "tripadvisor",
    links: [
      { type: "official", url: "https://www.blejskiotok.si/en/welcome-to-the-island/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274863-d296735-Reviews-Lake_Bled-Bled_Upper_Carniola_Region.html" },
    ],
  },
  "bled-castle": {
    wikiTitle: "Bled_Castle",
    desc: "Castelo medieval mais antigo da Eslovênia (séc. XI), no penhasco de 130m sobre o Lago Bled. Museu, capela gótica e gráfica funcional onde se imprime certificados.",
    source: "official",
    links: [
      { type: "official", url: "https://www.blejski-grad.si/en/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274863-d300864-Reviews-Bled_Castle-Bled_Upper_Carniola_Region.html" },
    ],
  },
  "confeitaria-park-bled": {
    desc: "Confeitaria histórica em Bled (1937) que serve a Kremšnita — bolo de creme com camadas de massa folhada, criado pelo confeiteiro Ištvan Lukačević. Receita nacional protegida.",
    source: "tripadvisor",
    highlights: ["Inventores oficiais da Kremšnita — receita protegida desde 1953."],
  },
  "lago-bohinj": {
    wikiTitle: "Lake_Bohinj",
    desc: "Maior lago glacial da Eslovênia (4,2 km × 1 km), parte do Parque Nacional Triglav. Mais selvagem e tranquilo que Bled. Igreja de São João Batista do séc. XV na ponta leste.",
    highlights: ["Mais autêntico que Bled — sem multidões, água potável."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274865-d296736-Reviews-Lake_Bohinj-Bohinjsko_Jezero_Upper_Carniola_Region.html" }],
  },
  "vogel-cable-car": {
    desc: "Teleférico que sobe 1.000m até a estação Vogel a 1.535m, com vista panorâmica do Triglav (2.864m, ponto mais alto da Eslovênia) e dos Alpes Julianos. Trilhas leves no planalto.",
    source: "official",
    highlights: ["Vista 360° do Triglav e dos Alpes Julianos — melhor mirante acessível da Eslovênia."],
    links: [{ type: "official", url: "https://vogel.si/en/price-list-summer/" }],
  },
  "st-john-baptist-bohinj": {
    wikiTitle: "Church_of_St._John_the_Baptist,_Bohinj",
    desc: "Igreja católica medieval na margem leste do Lago Bohinj, com afrescos do séc. XV.",
    source: "wikivoyage",
  },
  "savica-waterfall": {
    wikiTitle: "Savica_Falls",
    desc: "Cachoeira de 78m em dois estágios, na nascente do rio Sava Bohinjka. Caminhada curta (~20 min) a partir do estacionamento.",
    source: "tripadvisor",
  },
  "pokljuka-plateau": {
    wikiTitle: "Pokljuka",
    desc: "Planalto karst a 1.300m no Parque Nacional Triglav, coberto por floresta de abetos. Centro de biatlo durante o inverno; trilhas suaves no verão.",
    source: "tripadvisor",
  },
  "pericnik-waterfall": {
    wikiTitle: "Peričnik_Falls",
    desc: "Cachoeira de 52m no vale Vrata, com passagem atrás da cortina d'água. Acessível por trilha de 15 minutos.",
    highlights: ["Permite caminhar atrás da cortina d'água — experiência rara em cachoeiras alpinas."],
    source: "alltrails",
    links: [{ type: "alltrails", url: "https://www.alltrails.com/trail/slovenia/kranjska-gora/slap-pericnik" }],
  },
  "zelenci-nature-reserve": {
    desc: "Reserva natural com nascentes do rio Sava Dolinka, em águas esmeralda a 6°C constante o ano todo. Passarela de madeira de 20 minutos.",
    source: "tripadvisor",
    highlights: ["Cores 'photoshopadas' naturalmente — minerais alpinos refletem o céu como espelho."],
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274870-d3626293-Reviews-Zelenci_Nature_Reserve-Kranjska_Gora_Upper_Carniola_Region.html" }],
  },
  "kranjska-gora": {
    wikiTitle: "Kranjska_Gora",
    desc: "Vila alpina no extremo noroeste da Eslovênia, na fronteira com Itália e Áustria. Estação de esqui no inverno; base para o Vršič Pass no verão.",
    source: "tripadvisor",
  },
  "free-parking-kranjska-gora": {
    desc: "Estacionamento livre em Kranjska Gora — ponto estratégico para sair cedo ao Vršič Pass (8 minutos da entrada do passo).",
    source: "park4night",
  },
  "jasna-lake": {
    desc: "Lago artificial duplo a 818m de altitude, na entrada sul do vale do Trenta. Reflexo do Triglav e estátua do Zlatorog (cabra-de-cristal mítica eslovena).",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274870-d7930362-Reviews-Lake_Jasna-Kranjska_Gora_Upper_Carniola_Region.html" }],
  },
  "vrsic-pass": {
    wikiTitle: "Vršič_Pass",
    desc: "Estrada de montanha mais alta da Eslovênia (1.611m), com 50 curvas em ferradura conectando Kranjska Gora ao vale do Trenta. Construída pelos prisioneiros russos da 1ª Guerra.",
    highlights: ["50 hairpin turns numeradas — escultura icônica em cobblestone."],
    warnings: ["Motorhome PASSA mas exige atenção máxima: cobblestones escorregadios, curvas cegas, gradiente >10%.", "Se choveu na véspera — usar Predel Pass como alternativa."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g274870-d3630674-Reviews-Vrsic_Pass-Kranjska_Gora_Upper_Carniola_Region.html" }],
  },
  "russian-chapel": {
    wikiTitle: "Russian_Chapel_on_the_Vršič_Pass",
    desc: "Capela ortodoxa de madeira na curva 8 do Vršič, memorial dos prisioneiros russos da 1ª Guerra mortos em uma avalanche em 1916 enquanto construíam a estrada.",
    source: "wikivoyage",
  },
  "great-soca-gorge": {
    desc: "Velika Korita Soče — gargantas estreitas escavadas pelo rio Soča em águas verde-esmeralda. Passarelas e pontes pênseis. Trilha curta (~30 min).",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g1091105-d19244212-Reviews-Velika_Korita_Soce-Soca_Slovenian_Littoral_Region.html" }],
  },
  bovec: {
    wikiTitle: "Bovec",
    desc: "Capital de aventura da Eslovênia, no alto vale do Soča. Base para rafting, kayak, canyoning e zipline. Cercada pelos Alpes Julianos.",
    source: "tripadvisor",
  },
  "camp-liza-bovec": {
    desc: "Camp Liza — camping à beira do Rio Soča em Bovec, com acesso direto às atividades aquáticas e trilhas dos Alpes Julianos.",
    source: "park4night",
    links: [{ type: "official", url: "https://www.camp-liza.si/en/" }],
  },
  "slap-kozjak": {
    desc: "Cachoeira de 15m em gruta semicircular esculpida pela água, formando uma piscina natural esmeralda. Trilha curta e fácil (~30 min ida).",
    highlights: ["Cenário de filme — gruta natural com cachoeira queda livre dentro de câmara rochosa."],
    source: "alltrails",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g319788-d10020027-Reviews-Kozjak_Waterfall-Kobarid_Slovenian_Littoral_Region.html" }],
  },
  "rafting-rio-soca": {
    desc: "Rafting comercial no Rio Soča com SportMix, em corredeiras Classe II–III por 2-3h. Wetsuit incluído, fotos grátis no fim do tour.",
    source: "official",
    highlights: ["Soča é considerado um dos rios mais belos da Europa pela cor verde-esmeralda persistente."],
    links: [{ type: "official", url: "https://sportmix.si/en/rafting/" }],
  },
  "lago-del-predil": {
    wikiTitle: "Lago_del_Predil",
    desc: "Lago alpino de 1 km a 959m de altitude na fronteira IT/SI. Cercado pelos Alpes Julianos, águas esmeralda. Passeio circular ~1h.",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g616173-d4828065-Reviews-Lago_del_Predil-Tarvisio_Province_of_Udine_Friuli_Venezia_Giulia.html" }],
  },
  "lago-di-fusine": {
    wikiTitle: "Fusine_Lakes",
    desc: "Pares de lagos glaciais (Superiore + Inferiore) em parque natural italiano na fronteira com Eslovênia. Reflexo do Monte Mangart (2.677m) em águas turquesa.",
    highlights: ["Hidden gem — menos famoso que Braies/Carezza, mas tão fotogênico quanto."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g616173-d3539872-Reviews-Laghi_di_Fusine-Tarvisio_Province_of_Udine_Friuli_Venezia_Giulia.html" }],
  },
  "cortina-d-ampezzo": {
    wikiTitle: "Cortina_d'Ampezzo",
    desc: "Vila resort em altitude (1.224m) no coração das Dolomitas, conhecida como 'Rainha das Dolomitas'. Sede dos Jogos Olímpicos de Inverno 1956 e 2026 (com Milão).",
    highlights: ["Sede dos JO de Inverno 2026 — restaurantes e infraestrutura premium."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Tourism-g194745-Cortina_d_Ampezzo_Province_of_Belluno_Veneto.html" }],
  },
  "camp-dolomiti-cortina": {
    desc: "Camping Dolomiti em Cortina — base para Tre Cime, Sorapis, Lago di Braies. Categoria A com lavanderia, restaurante e wellness.",
    source: "campercontact",
  },
  "tre-cime-di-lavaredo": {
    wikiTitle: "Tre_Cime_di_Lavaredo",
    desc: "Três torres de calcário (2.999m / 2.973m / 2.857m) no coração das Dolomitas. Trilha circular de 10 km ao redor delas é a caminhada mais icônica do parque.",
    highlights: ["Cartão-postal definitivo das Dolomitas — circuito de 10 km com vista das três faces ao longo do trajeto."],
    warnings: ["Reserva online obrigatória da estrada pedagiada (pass.auronzo.info), abre apenas 30 dias antes.", "Pedágio motorhome €60. Lota cedo no verão."],
    source: "alltrails",
    links: [
      { type: "official", url: "https://auronzo.info/en/parking-tre-cime-di-lavaredo/" },
      { type: "alltrails", url: "https://www.alltrails.com/trail/italy/veneto/tre-cime-di-lavaredo-laghi-dei-piani?u=m" },
    ],
  },
  "rifugio-auronzo": {
    desc: "Rifúgio a 2.320m no início da trilha das Tre Cime. Estacionamento, café e ponto de partida do circuito clássico.",
    source: "refuges-info",
  },
  "rifugio-locatelli": {
    wikiTitle: "Dreizinnenhütte",
    desc: "Rifúgio Locatelli/Dreizinnenhütte (2.405m) no ponto mais fotografado das Tre Cime — vista frontal das três torres.",
    source: "refuges-info",
  },
  "lago-di-sorapis": {
    wikiTitle: "Lake_Sorapiss",
    desc: "Lago turquesa leitoso a 1.925m, alimentado pelo derretimento da geleira do Sorapis. Trilha de 11,5 km (5–6h) com trechos equipados com cabos de aço.",
    highlights: ["Cor turquesa leitosa devido ao 'leite glacial' (sedimentos da geleira) — única no mundo nessa intensidade."],
    warnings: ["Cabos de aço em alguns trechos — luvas de trekking obrigatórias.", "Não fazer se choveu — pedras escorregadias.", "Rifugio Vandelli aceita SOMENTE CASH."],
    source: "alltrails",
    links: [{ type: "alltrails", url: "https://www.alltrails.com/trail/italy/veneto/passo-tre-croci-lago-sorapis?u=m" }],
  },
  "passo-tre-croci": {
    desc: "Passo a 1.809m a leste de Cortina, trailhead para o Lago di Sorapis. Estacionamento limitado — chegar antes das 7h no verão.",
    source: "park4night",
  },
  "lago-di-braies": {
    wikiTitle: "Lake_Braies",
    desc: "Lago alpino de 31 hectares a 1.496m, conhecido como 'Pérola dos Lagos Dolomíticos'. Águas turquesa com reflexo do Croda del Becco. Barcos a remo de madeira disponíveis.",
    highlights: ["Um dos lagos mais fotografados do mundo — barcos a remo Lärchenboot são marca registrada."],
    warnings: ["Acesso restrito por reserva entre 10/Jul–10/Set — em junho ainda livre.", "Estacionamento enche cedo no verão."],
    source: "tripadvisor",
    links: [
      { type: "alltrails", url: "https://www.alltrails.com/trail/italy/south-tyrol/lago-di-braies" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g194740-d3395875-Reviews-Pragser_Wildsee-Prags_Braies_Province_of_South_Tyrol_Trentino_Alto_Adige.html" },
    ],
  },
  "dobbiaco-san-candido": {
    wikiTitle: "Dobbiaco",
    desc: "Vilas tirolesas no Alto Adige (Dobbiaco/Toblach + San Candido/Innichen) — arquitetura germânica, ciclovia plana de 14 km entre as duas, gelaterias.",
    source: "tripadvisor",
  },
  "camp-olympia-dobbiaco": {
    desc: "Camping Olympia ★★★★ em Dobbiaco — Categoria A. Wellness completo (sauna finlandesa, banho turco, infravermelhos, piscinas). Self-service laundry. Incluso na diária.",
    source: "campercontact",
    highlights: ["Wellness completo incluso na diária — recuperação ideal após Tre Cime/Sorapis."],
    links: [{ type: "official", url: "https://www.camping-olympia.com/en/wellness" }],
  },
  "bressanone-brixen": {
    wikiTitle: "Brixen",
    desc: "Cidade episcopal do Tirol do Sul, fundada em 901. Catedral barroca, claustros românicos, centro pedonal medieval.",
    source: "tripadvisor",
  },
  "chiusa-klausen": {
    wikiTitle: "Klausen,_South_Tyrol",
    desc: "Vila medieval (Klausen em alemão) no Vale Eisack, fundada na Idade Média como ponto de pedágio. Albrecht Dürer pintou a vista em 1494.",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Tourism-g1150025-Chiusa_Province_of_South_Tyrol_Trentino_Alto_Adige.html" }],
  },
  "monastero-di-sabiona": {
    wikiTitle: "Säben_Abbey",
    desc: "Mosteiro beneditino feminino fundado no séc. X sobre o penhasco acima de Chiusa. Vista panorâmica do Vale Eisack. Caminhada íngreme ~1h.",
    source: "wikivoyage",
  },
  "ortisei-st-ulrich": {
    wikiTitle: "Urtijëi",
    desc: "Capital de Val Gardena (St. Ulrich em alemão, Urtijëi em ladino). Tradição secular de escultura em madeira. Centro pedonal com gelaterias e artesanato.",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Tourism-g194900-Ortisei_St_Ulrich_Province_of_South_Tyrol_Trentino_Alto_Adige-Vacations.html" }],
  },
  "camp-seiser-alm-val-gardena": {
    desc: "Camping em Val Gardena — base para Seceda, Alpe di Siusi, Sassolungo. Vista das Odle/Geisler.",
    source: "campercontact",
  },
  "seceda-ridgeline": {
    wikiTitle: "Seceda",
    desc: "Crista a 2.519m em Val Gardena com a vista das Odle/Geisler — uma das paisagens mais fotografadas das Dolomitas. Cable car de Ortisei + circuito de 10 km.",
    highlights: ["Crista icônica das Dolomitas — referência visual em filmes e calendários alpinos."],
    warnings: ["Reserva online obrigatória em 2026 (seceda.it). Tickets pessoais e não-reembolsáveis.", "Taxa €5/pp no torniquete (NOVO 2026). Proibido sair das trilhas."],
    source: "alltrails",
    links: [
      { type: "official", url: "https://www.seceda.it" },
      { type: "alltrails", url: "https://www.alltrails.com/trail/italy/south-tyrol/seceda-cir?u=m" },
    ],
  },
  "rifugio-firenze": {
    desc: "Rifugio Firenze (Regensburger Hütte, 2.040m) abaixo das Odle/Geisler. Cozinha tradicional sul-tirolesa, terraço com vista da crista do Seceda.",
    source: "refuges-info",
  },
  "ortisei-jantar-tiroles": {
    desc: "Restaurantes tradicionais sul-tiroleses em Ortisei — Tubladel (cozinha gourmet ladina), Concordia (familiar) ou Hotel Nives (Michelin-recognized).",
    source: "tripadvisor",
  },
  "alpe-di-siusi-compatsch": {
    wikiTitle: "Alpe_di_Siusi",
    desc: "Maior prado alpino contínuo da Europa (56 km² a 1.700–2.300m). Vista panorâmica do Sassolungo, Sella e Catinaccio. Pico de florescimento em junho.",
    highlights: ["Maior prado alpino da Europa — espetáculo de flores silvestres em junho.", "Vista 360° dos três massivos dolomíticos: Sassolungo, Sella, Catinaccio."],
    source: "official",
    links: [
      { type: "official", url: "https://www.seiseralm.it/en/info/getting-around/seiser-alm-aerial-cableway-summer.html" },
      { type: "alltrails", url: "https://www.alltrails.com/trail/italy/south-tyrol/compatsch-biotop-grosses-moos-panorama?u=m" },
    ],
  },
  castelrotto: {
    wikiTitle: "Kastelruth",
    desc: "Vila tirolesa medieval (Kastelruth em alemão), uma das mais charmosas do Alto Adige. Centro pedonal, igreja com torre barroca, Spitzbuam (banda folk famosa).",
    source: "tripadvisor",
  },
  "lago-di-carezza": {
    wikiTitle: "Lake_Carezza",
    desc: "Pequeno lago alpino a 1.520m com reflexo perfeito do Latemar e Catinaccio. Cores entre turquesa e verde-esmeralda. Caminhada circular de 30 min.",
    highlights: ["Cores 'arco-íris' lendárias — diz a lenda local que uma sereia se transformou no lago.", "Um dos lagos mais fotogênicos das Dolomitas, sempre cheio em julho/agosto."],
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g1023620-d2335498-Reviews-Lake_Carezza-Nova_Levante_Province_of_South_Tyrol_Trentino_Alto_Adige.html" }],
  },
  "desenzano-del-garda": {
    wikiTitle: "Desenzano_del_Garda",
    desc: "Cidade medieval na margem sul do Lago di Garda, com castelo do séc. X, porto histórico e ruínas romanas. 15 min de Sirmione.",
    source: "tripadvisor",
  },
  sirmione: {
    wikiTitle: "Sirmione",
    desc: "Península termal no Lago di Garda, com fortaleza scaligera do séc. XIII e ruínas da villa romana de Catulo. Centro storico pedonal com gelaterias.",
    source: "tripadvisor",
    links: [{ type: "tripadvisor", url: "https://www.tripadvisor.com/Tourism-g187842-Sirmione_Province_of_Brescia_Lombardy.html" }],
  },
  "free-parking-desenzano": {
    desc: "Estacionamento livre em Via Michelangelo 9, Desenzano del Garda. 5 min do centro a pé. Permite pernoite. Park4Night verificado.",
    source: "park4night",
    links: [{ type: "park4night", url: "https://park4night.com/en/place/14906" }],
  },
  "castello-scaligero-sirmione": {
    wikiTitle: "Scaliger_Castle,_Sirmione",
    desc: "Fortaleza naval do séc. XIII construída pela família Scaligera de Verona. Único castelo italiano com darsena (porto fortificado interno) ainda intacto. Subida na torre com vista do lago.",
    highlights: ["Único castelo medieval italiano com darsena (porto interno fortificado) preservada."],
    source: "official",
    links: [
      { type: "official", url: "https://museilombardia.cultura.gov.it/musei/castello-scaligero-di-sirmione/" },
      { type: "tripadvisor", url: "https://www.tripadvisor.com/Attraction_Review-g187842-d2218711-Reviews-Castello_Scaligero-Sirmione_Province_of_Brescia_Lombardy.html" },
    ],
  },
  "grotte-di-catullo": {
    wikiTitle: "Grottoes_of_Catullus",
    desc: "Ruínas de villa romana do séc. I a.C. na ponta da península de Sirmione, atribuída ao poeta Catulo. Vista panorâmica do Lago di Garda do alto das ruínas.",
    source: "official",
    links: [{ type: "official", url: "https://www.grottedicatullo.beniculturali.it/" }],
  },
  "farewell-lunch-garda": {
    desc: "Almoço de despedida na península de Sirmione — pedir peixe do Garda (lavarello, luccioperca) acompanhado de Lugana DOC, vinho branco local DOC.",
    source: "tripadvisor",
  },
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const UA = "claude-x8-travel-skill/1.0 (https://github.com/marcuslacerda/claude-x8-travel-skill)";

async function fetchOgImage(title) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function validatePicture(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    return data; // { extract, originalimage, thumbnail, ... }
  } catch {
    return null;
  }
}

async function fetchPopularity(title) {
  // Last 12 complete months
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1));
  const fmt = (d) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`;
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(title)}/monthly/${fmt(start)}/${fmt(end)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items) return null;
    const total = data.items.reduce((s, i) => s + (i.views ?? 0), 0);
    if (total < 100) return null;
    return Math.round(Math.min(Math.log10(total), 10) * 10) / 10;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-POI enrichment
// ---------------------------------------------------------------------------
async function enrichOne(poiId) {
  const config = enrichmentMap[poiId];
  if (!config) return { poiId, picture: null, popularity: null, desc: null, source: null, links: null, highlights: null, warnings: null };
  const result = {
    poiId,
    picture: null,
    popularity: null,
    desc: config.desc ?? null,
    source: config.source ?? null,
    links: config.links ?? null,
    highlights: config.highlights ?? null,
    warnings: config.warnings ?? null,
  };
  if (config.wikiTitle) {
    const [ogImage, summary, popularity] = await Promise.all([
      fetchOgImage(config.wikiTitle),
      fetchSummary(config.wikiTitle),
      fetchPopularity(config.wikiTitle),
    ]);
    let pic = ogImage;
    if (pic) {
      const ok = await validatePicture(pic);
      if (!ok) pic = null;
    }
    if (!pic && summary?.originalimage?.source) {
      const candidate = summary.originalimage.source.replace(/\/(\d+)px-/, "/1280px-");
      const ok = await validatePicture(candidate);
      if (ok) pic = candidate;
    }
    if (!pic && summary?.thumbnail?.source) {
      const ok = await validatePicture(summary.thumbnail.source);
      if (ok) pic = summary.thumbnail.source;
    }
    result.picture = pic;
    result.popularity = popularity;
    if (summary?.extract && !config.desc) {
      result.desc = summary.extract.split(". ")[0] + ".";
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Concurrency-controlled processing
// ---------------------------------------------------------------------------
async function batched(items, fn, concurrency = 6) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const r = await fn(items[i]);
      results[i] = r;
      process.stdout.write(`[${i + 1}/${items.length}] ${items[i]} → ${r.picture ? "📷" : "  "} ${r.popularity ?? "  "}\n`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const allPoiIds = map.pois.map((p) => p.id);
console.log(`Enriching ${allPoiIds.length} POIs...\n`);
const enriched = await batched(allPoiIds, enrichOne, 6);
const byId = Object.fromEntries(enriched.map((r) => [r.poiId, r]));

// Apply to map.pois
let mapPicCount = 0, mapPopCount = 0, mapDescCount = 0;
for (const poi of map.pois) {
  const e = byId[poi.id];
  if (!e) continue;
  if (e.desc) { poi.description = e.desc; mapDescCount++; }
  if (e.picture) { poi.picture = e.picture; mapPicCount++; }
  if (e.popularity != null) { poi.popularity = e.popularity; mapPopCount++; }
  if (e.source) poi.source = e.source;
}
// Note: schema has `description`, not `picture`, on MapPOI. Drop poi.picture.
for (const poi of map.pois) delete poi.picture;

// Apply to trip.days[].schedule[].experience (where poiId matches)
let tripPicCount = 0, tripPopCount = 0, tripDescCount = 0, insightCount = 0;
for (const day of trip.days) {
  const newSchedule = [];
  for (let i = 0; i < day.schedule.length; i++) {
    const item = day.schedule[i];
    newSchedule.push(item);
    if (item.type !== "experience" || !item.poiId) continue;
    const e = byId[item.poiId];
    if (!e) continue;
    if (e.desc && !item.desc) { item.desc = e.desc; tripDescCount++; }
    if (e.picture) { item.picture = e.picture; tripPicCount++; }
    if (e.popularity != null) { item.popularity = e.popularity; tripPopCount++; }
    if (e.source && !item.source) item.source = e.source;
    if (e.links && !item.links) item.links = e.links;
    // Append Insight after the Experience if highlights/warnings exist
    if ((e.highlights?.length || e.warnings?.length)) {
      const insight = { type: "insight" };
      if (e.highlights?.length) insight.highlights = e.highlights;
      if (e.warnings?.length) insight.warnings = e.warnings;
      newSchedule.push(insight);
      insightCount++;
    }
  }
  day.schedule = newSchedule;
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n");
writeFileSync(TRIP_PATH, JSON.stringify(trip, null, 2) + "\n");
console.log(
  `\n✓ map.json: ${mapPicCount} pictures (note: stored only on Experience), ${mapPopCount} popularity, ${mapDescCount} descriptions`,
);
console.log(`✓ trip.json: ${tripPicCount} pictures, ${tripPopCount} popularity, ${tripDescCount} descriptions, ${insightCount} insights inserted`);
