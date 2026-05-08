# {{SLUG}} — trip parameters

> Filled by the new-trip wizard in Claude Code. The skill reads this file to drive research and trip.json generation. Edit by hand if you want to override or refine.

---

## Identity

- **Slug:** {{SLUG}}
- **Title:** _e.g. "Highlands & Skye Winter Loop"_
- **Status:** draft

## Destination

- **Start location:** _origin city — e.g. "São Paulo"_
- **Headline to:** _primary destination — e.g. "Edinburgh"_
- **Headline from:** _return point — usually equal to start location_

## Duration & dates

- **Duration:** _N days_
- **Start date:** _YYYY-MM-DD if known, else YYYY-MM (month-only) or "flexible"_
- **Currency:** _trip currency at destination — EUR / GBP / USD / BRL / etc._
- **Timezone:** _IANA — e.g. "Europe/London" (optional, helps the viewer compute "today")_

## Transport & style

- **Primary transport:** _car / motorhome / flights+train / ferry / mixed_
- **Trip type:** _city break / road trip / trekking / off-grid / mix_

## Constraints

_Anything special the skill should know — pets, kids, mobility, dietary, drone, etc._

- _e.g. "two travelers, no pets, light fitness OK with up to 600m elevation gain"_

## Additional info

_Free-form notes the user added during the wizard. The skill weighs these heavily during research._

> _e.g. "Want to do a whisky distillery tour at least once. Only one of us drives on the left, so all driving falls on that traveler. Avoid B&Bs above £150/night."_
