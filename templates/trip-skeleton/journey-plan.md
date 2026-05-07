# {{SLUG}} — [Trip Title]

> Source of truth for this trip. Edit this file; the skill modes parse it. The companion `journey.html`, `trip.json`, and `map.json` are derived from this and should be regenerated, not hand-edited.

**Status:** draft / planned / active / completed
**Dates:** YYYY-MM-DD → YYYY-MM-DD
**Duration:** _N_ days
**Currency:** EUR / USD / BRL / etc.
**Travelers:** _list of travelers_

---

## 1. Flights

| Route                | Date             | Carrier | Booking ref  | Status  |
| -------------------- | ---------------- | ------- | ------------ | ------- |
| ORIGIN → DESTINATION | YYYY-MM-DD HH:MM | TBD     | _[REDACTED]_ | pending |

## 2. Transport

| Mode             | Pickup   | Dropoff  | Provider | Booking ref  |
| ---------------- | -------- | -------- | -------- | ------------ |
| _e.g. Motorhome_ | DATE LOC | DATE LOC | TBD      | _[REDACTED]_ |

## 3. Route Overview

A high-level map of how the trip flows from origin to destination, broken by leg.

| Leg | From → To         | Distance | Drive base | Drive +30% | Notes             |
| --- | ----------------- | -------- | ---------- | ---------- | ----------------- |
| 1   | _PointA → PointB_ | _XXX km_ | _Xh_       | _Xh_       | _via xyz, scenic_ |

## 4. Accommodations

| Date       | Place               | Provider | Cost  | Booking ref |
| ---------- | ------------------- | -------- | ----- | ----------- |
| YYYY-MM-DD | _Hotel/Camp/Rental_ | TBD      | _€XX_ | _pending_   |

## 5. Day-by-Day Itinerary

### Day 1 — YYYY-MM-DD — _Title_

**Highlight:** _the one main thing for this day_

- 07:00 — _morning activity_
- 12:00 — _lunch_
- 14:00 — _afternoon_
- 19:00 — _dinner / camp_

**Driving:** _origin → destination, distance, time_
**Camp / Stay:** _name + booking_
**Plan B (rain/closure):** _alternative_

### Day 2 — YYYY-MM-DD — _Title_

_(repeat per day)_

## 6. Budget Breakdown

| Slug           | Category               | Amount  | %    | Status      | Notes                   |
| -------------- | ---------------------- | ------- | ---- | ----------- | ----------------------- |
| flights        | Flights                | _€XXXX_ | _XX_ | _confirmed_ | _N pax_                 |
| accommodations | Accommodations         | _€XXXX_ | _XX_ | _estimated_ | _N nights_              |
| fuel           | Fuel                   | _€XXX_  | _X_  | _estimated_ | _XXX km / X km/L_       |
| food           | Food                   | _€XXX_  | _X_  | _estimated_ | _markets + restaurants_ |
| activities     | Activities & tickets   | _€XXX_  | _X_  | _estimated_ | _cable cars, museums_   |
| unplanned      | Emergency buffer (10%) | _€XXX_  | _10_ | reserve     | _required_              |

**Total:** _€XXXX_

> **Important:** every trip must have a `unplanned` budget item. The runtime defaults expenses there if no other slug matches.

## 7. Key Features & Highlights

_What makes this trip distinctive — the experiences you're really going for._

- _highlight 1_
- _highlight 2_

## 8. Risks & Contingencies

| Risk                | Probability | Mitigation                       |
| ------------------- | ----------- | -------------------------------- |
| _Trail closure_     | medium      | _Plan B in each day card_        |
| _Camp fully booked_ | low         | _Backup list of nearby campings_ |

## 9. Distances & Driving Times

_Reference table for all driving segments — use `validate-routes` to audit against Google Maps._

| Segment | Distance | Google base | +30% mountain margin |
| ------- | -------- | ----------- | -------------------- |
| _A → B_ | _XXX km_ | _Xh XXm_    | _Xh XXm_             |

## 10. Apps & Links

- **Maps:** _Komoot, AllTrails, Park4Night, etc._
- **Weather:** _MeteoBlue, MeteoSwiss, etc._
- **Booking:** _Booking, CamperContact, etc._

## 11. Do's & Don'ts — _Region_

**Do**

- _local etiquette tip_

**Don't**

- _common mistake to avoid_

## 12. Prep Checklist

### 3 months before

- [ ] _Critical booking item_

### 2 months before

- [ ] _Item_

### 1 month before

- [ ] _Item_

### 2 weeks before

- [ ] _Item_

### 1 week before

- [ ] _Item_

### Travel day

- [ ] _Item_

## 13. Packing List

### 🎒 Documents

- [ ] **Passports** — validity ≥6 months from travel
- [ ] **Insurance** — print or save offline

### 🧥 Clothing

- [ ] _Item_

### 🛠️ Gear

- [ ] _Item_

### 📱 Tech

- [ ] _Item_

## 14. References & Sources

- _link to source 1_
- _link to source 2_
