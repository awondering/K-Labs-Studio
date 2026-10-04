# K-Labs Studio Build 007

Fixes:
- All three wheels now use the same centre-value highlight logic.
- First Guide and Target Stripper selected values turn titanium white while editing.
- Locked selected values turn K-Labs red.
- Cleaned CSS file structure.


Build 007: Adds visible Unlock/Edit button and freezes wheel scrolling while locked.

## Shared UI Rules

- Every app dropdown, including selects and datalist suggestions, uses `initializeStudioCustomSelects()` in `js/ui.js`; do not expose native OS menus. Preserve the underlying value and dispatch its normal `input`/`change` events so dependent options and existing handlers continue working.
- Custom pickers reuse the dark `.component-sheet` surface, accessible labels, arrow/Home/End/Enter navigation, Escape, Cancel/outside dismissal, and focus restoration. Long lists scroll inside the visual viewport-safe sheet above navigation and safe areas; datalist inputs retain free-text entry.
- Picker triggers, option rows, and actions have at least 44px touch targets. Use compact aligned carbon controls, titanium text/fine borders, restrained red selected/focus states, and shared action styles instead of one-off picker skins.
- Component duplication preserves the source parent Category, explicitly sets Subcategory to `''`, and never infers or creates hierarchy from a component name. Copies receive fresh IDs and zero stock when tracking is active while retaining other component fields. Preserve the original and historical builds.
- Build rows use `libraryComponentId` for identity, deduplication, and size resolution; use name matching only as a legacy fallback for unlinked rows.
- One-off account data repairs require a unique exact name or stronger identity, preserve unrelated fields/history/taxonomy, and skip ambiguous matches.
