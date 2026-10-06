# K-Labs Studio Build 007

Fixes:
- All three wheels now use the same centre-value highlight logic.
- First Guide and Target Stripper selected values turn titanium white while editing.
- Locked selected values turn K-Labs red.
- Cleaned CSS file structure.


Build 007: Adds visible Unlock/Edit button and freezes wheel scrolling while locked.

## Shared UI Rules

- Track Component Stock shares the Measurement Units and Date Format disclosure spacing and uses the summary "Track quantities as parts are used." Its heading target extends into the existing padding without adding visible space; descriptions wrap naturally and switch behavior is unchanged.
- Settings Pricing & Tax uses three compact label/control rows: Default tax, Tax rate (%) and Labour rate ($/hr). Numeric controls share a right edge and width; the default-tax switch omits visual OFF/ON text while retaining its accessible label and checked state. Controls retain 44px targets, decimal keypad hints and visible keyboard focus.
- The build editor's Components heading is a full-width disclosure with count and trailing chevron. Add Component sits above the existing list inside the expanded body, not in the heading or a separate card; collapsing hides it without rebuilding editors or discarding unsaved values. The heading and Add action retain native button keyboard activation, visible focus and at least 44px targets.
- Build Pricing keeps labour and profit/margin inputs paired (stacking only below 341px), read-only build costs in compact result rows, and Final Customer Price full-width. It reuses shared dark surfaces, titanium labels, restrained red emphasis and 44px controls; pricing handlers, tax/deposit visibility and quote outputs are unchanged.
- Every app dropdown, including selects and datalist suggestions, uses `initializeStudioCustomSelects()` in `js/ui.js`; do not expose native OS menus. Preserve the underlying value and dispatch its normal `input`/`change` events so dependent options and existing handlers continue working.
- Custom pickers reuse the dark `.component-sheet` surface, accessible labels, arrow/Home/End/Enter navigation, Escape, Cancel/outside dismissal, and focus restoration. Long lists scroll inside the visual viewport-safe sheet above navigation and safe areas; datalist inputs retain free-text entry.
- Picker triggers, option rows, and actions have at least 44px touch targets. Use compact aligned carbon controls, titanium text/fine borders, restrained red selected/focus states, and shared action styles instead of one-off picker skins.
- Individual component duplication preserves the source Category/Subcategory, Brand, pricing and sizes, and never infers or creates hierarchy from a component name. Copies receive fresh IDs and zero stock without changing stock-tracking settings. Unassigned sources remain unassigned. Duplicate Family creates a sibling family under the same category. Preserve the original and historical builds.
- Inside a saved family, Duplicate Family copies the complete family to a new sibling under the displayed parent category and returns to its A-Z family list. The dialog resolves the source by category/family IDs at confirmation; individual actions are labelled Duplicate Component.
- Build rows use `libraryComponentId` for identity, deduplication, and size resolution; use name matching only as a legacy fallback for unlinked rows.
- One-off account data repairs require a unique exact name or stronger identity, preserve unrelated fields/history/taxonomy, and skip ambiguous matches.
- Components browse as Category -> Subcategory/Family -> Components. Winding Checks colours/types are explicit families; Reel Seats may use brand-named families. Family rows show only the name and actions; Brand remains optional component data.
- Categories, families and components use the shared case-insensitive, natural A-Z display helpers after Add/Rename/Duplicate and on reopen. Stored array order and IDs are preserved; category/family Move Up/Down controls are not offered.
- Records with no Subcategory (including duplicates of unassigned components) appear inside the virtual Unassigned family bucket, not as family rows or direct category-level components. Adding a component in that bucket retains an empty Subcategory; adding a family creates taxonomy only. Names never imply record type or trigger conversion/merging. The virtual bucket has no taxonomy actions.
- Existing records such as Black Silver, Gunmetal Hexy Duplicate and Hex need a separate identity-based review if they were intended as families or assigned to one. Their names alone do not establish that intent; do not repair live data from labels.
- Focused hierarchy regression checks: `node --test tests/components-hierarchy.test.cjs`. These evaluate only the relevant UI functions with in-memory records, taxonomy and DOM doubles; they do not launch a browser, app startup, migrations, local storage or cloud sync.
- Available Sizes keeps saved chips visible. Manual entry and From/To/Step range controls sit inside a collapsed Add or Edit Sizes disclosure; editing remains draft-only until Save Changes.
- Workshop Diameter & Circumference retains live conversion and adds wraps (default 1.00, quarter-turn buttons, minimum 0.25). Wrap Length Required is circumference times wraps for straight blanks and thin sheets; it does not include thickness correction or Grip Wrap calculations.
- Guide Setup uses view-only Spacing -> Orientation -> Placement stages with explicit Continue and collapsed-stage reopening. Each collapsed heading and summary is one native button with a far-right chevron, keyboard activation, visible focus and a 44px minimum target; open headings and input bodies do not toggle stages. Reopening uses the existing Edit/scroll path. Existing controls, geometry, saved-build specification and print output remain authoritative. Guide-row angles are applied rotations from the reel side (0 degrees); focused rotation inputs retain the user's edit while limits apply (stripper 0–25, others 0–180). Surface distance uses each guide's diameter and applied reel-side angle. Per-guide diameters remain in memory; the existing build specification does not persist diameters.
- Show Offsets sits beside Show Spacing in the Guides header. Eligible non-reference guides reveal diameter and offset together without opening rotation editors. Missing/invalid diameters show "Enter blank diameter"; hiding offsets retains each guide's entered diameter.
- Guide Setup's Continue and Edit actions scroll the newly opened stage's heading to the top of the usable viewport, below the fixed header and safe-area inset, once the previous stage has collapsed and the new stage's layout has settled. Ordinary field edits and result re-renders never trigger this scroll.
