# v7.4 Visual Normalization

## Scope

This pass corrects visual-system drift without replacing the approved v7 interface. The locked base, feature, UX, and icon files remain unchanged. The corrections live in `css/player-terminal-normalization.css`, loaded after the previous v7 layers.

No API endpoint, read model, write boundary, route, icon definition, authentication behavior, or map geometry was changed.

## Typography roles

The normalization layer establishes four reusable content roles:

| Role | Size | Intended use |
|---|---:|---|
| Label | 10px | uppercase section and field labels |
| Metadata | 11px | timestamps, issuer names, supporting values |
| Body | 13px | explanatory and instructional copy |
| Entity | 15px | item, product, company, contract, and person names |

Large page and metric typography remains in the established v7 scale. Decorative ticker text is intentionally denser and is not used for important names or instructions.

## Spacing rhythm

Shared page and component spacing now derives from a 4/8/12/16/24/32 pixel scale. This normalizes:

- page-to-page vertical rhythm;
- panel headers and section spacing;
- filter and toolbar gaps;
- cards and list rows;
- forms and action groups;
- mobile safe areas and scroll margins.

## Containment and collision corrections

The pass adds explicit `min-width: 0`, wrapping, and internal grid rules where inherited inline flow or fixed grid tracks caused visual collisions.

Specific repairs include:

- business category, product name, description, and supplier status separation;
- crafting summary, recipe, and production-queue separation;
- loan-purpose and facility-name separation;
- resilient contract title and issuer columns;
- store and inventory title wrapping;
- market asset-name containment;
- message-thread and profile-identity wrapping;
- mobile page-heading flex-basis correction;
- mobile Store search-field flex-basis correction;
- safe content padding around clipped terminal geometry.

## Interactive map

The prior map-overlay correction remains intact:

- no persistent information card covers the southern countries;
- all ten country borders remain hoverable, focusable, and clickable;
- `Enter` and `Space` open the selected country intelligence dialog;
- the player's home country retains its persistent border treatment.

## Explicit non-goals

This pass does not consolidate or delete the inherited v7 stylesheet stack. A full CSS architecture refactor remains deferred because it would reintroduce unacceptable visual-regression risk before backend integration.
