# M2 · Organize and Edit (Pin / Sections / Rename / Appearance) · Evidence

[简体中文](m2-organize-and-edit-zh.md)

- Card: M2 (sections, pinning, search, appearance editing, rename, local schema migration)
- Status: **Pinning, sections, collapsing and appearance/rename editing for remote Bots are implemented and persisted;
  real-service appearance CAS and rename have been verified in `m2-create-and-appearance.md`**
- Recorded: 2026-11-04

## Implementation

- **Local state schema v2**: each connection gains `organization` (`pinned`, `sections[{id,title,botIds,collapsed}]`,
  `unsortedCollapsed`). Reading a v1 document migrates automatically (adds an empty organization, keeps drafts/selection/inspector/preferences);
  higher versions are still refused rather than overwritten; atomic write + previous-version backup unchanged.
- **Pinning**: pin/unpin in the inspector "Manage" area; the left-column pinned grid renders in saved order; when
  nothing is set, the default first 6 are kept.
- **Sections**: the inspector can create sections and move Bots into/out of a section; the left-column section header
  supports collapsing, and the `⋯` menu supports renaming/deleting; after a section is deleted its Bots return to
  "Ungrouped"; empty sections show an empty state.
- **Search**: after the remote roster is replaced, the existing search index (profile name/summary) is reused; no extra backend needed.
- **Edit Bot**: the inspector's "Edit appearance and name" reuses the creation sheet (edit mode), pre-filling the current
  name/shape/color; on save `profiles.configure` writes appearance and title with `ui_meta_expected_revisions` CAS, and a
  name change goes through `PATCH /api/profiles/{name}` rename; a revision conflict prompts a retry; on success the Bot is
  upserted and stays selected.
- All organization changes are written to `local-state.json` with a 600 ms debounce and restored after restart (including
  collapsed state).

## Verification

| Check                               | Result                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                         | **133 cases passed** (new remote-organization reducer/selector, v1→v2 migration, organization persistence projection) |
| `pnpm test:e2e`                     | 11 cases passed (fixture path and restart persistence unaffected)                                                     |
| typecheck / lint / format / package | passed                                                                                                                |
| Real appearance CAS / rename        | see `m2-create-and-appearance.md`: write, read-back, conflict and rename all pass                                     |

## Incomplete / limitations

- Sections and pinning are a **local organization view** and are not written to the server; they do not sync across
  machines (sync with the mobile `ui_meta` organization fields is left for later).
- Drag-to-reorder is not supported yet; section order is creation order and pinned order is click order.
- The edit sheet is only available for Bots in connected mode; fixture mode stays a read-only demo.
- Renaming changes the profile name, but the canonical Bot Chat and sessions are kept; drafts continue under the new
  profile name.
