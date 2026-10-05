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
- Individual component duplication preserves the source Category/Subcategory, Brand, pricing and sizes, and never infers or creates hierarchy from a component name. Copies receive fresh IDs and zero stock without changing stock-tracking settings. Unassigned sources remain unassigned. Duplicate Family creates a sibling family under the same category. Preserve the original and historical builds.
- Build rows use `libraryComponentId` for identity, deduplication, and size resolution; use name matching only as a legacy fallback for unlinked rows.
- One-off account data repairs require a unique exact name or stronger identity, preserve unrelated fields/history/taxonomy, and skip ambiguous matches.
- Components browse as Category -> Subcategory/Family -> Components. Winding Checks colours/types are explicit families; Reel Seats may use brand-named families. Family rows show only the name and actions; Brand remains optional component data.
- Categories, families and components use the shared case-insensitive, natural A-Z display helpers after Add/Rename/Duplicate and on reopen. Stored array order and IDs are preserved; category/family Move Up/Down controls are not offered.
- Records with no Subcategory (including duplicates of unassigned components) appear inside the virtual Unassigned family bucket, not as family rows or direct category-level components. Adding a component in that bucket retains an empty Subcategory; adding a family creates taxonomy only. Names never imply record type or trigger conversion/merging. The virtual bucket has no taxonomy actions.
- Existing records such as Black Silver, Gunmetal Hexy Duplicate and Hex need a separate identity-based review if they were intended as families or assigned to one. Their names alone do not establish that intent; do not repair live data from labels.
- Focused hierarchy regression checks: `node --test tests/components-hierarchy.test.cjs`. These evaluate only the relevant UI functions with in-memory records, taxonomy and DOM doubles; they do not launch a browser, app startup, migrations, local storage or cloud sync.
- Available Sizes keeps saved chips visible. Manual entry and From/To/Step range controls sit inside a collapsed Add or Edit Sizes disclosure; editing remains draft-only until Save Changes.
- Workshop Diameter & Circumference retains live conversion and adds wraps (default 1.00, quarter-turn buttons, minimum 0.25). Wrap Length Required is circumference times wraps for straight blanks and thin sheets; it does not include thickness correction or Grip Wrap calculations.
