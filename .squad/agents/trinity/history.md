# Project Context

- **Owner:** kdcllc
- **Project:** UI and local HTTP service for managing Ollama models, custom Modelfiles, metadata, and hardware-aware optimization guidance.
- **Stack:** Node.js 18+, TypeScript, Express, browser UI in `public/`, compiled artifacts in `dist/`, npm package with `npx` entrypoint
- **Created:** 2026-04-19T10:37:30.160Z

## Learnings

- Team initialized with Trinity as Frontend Dev.
- **UX Review (2026-04-19):** Current layout hierarchy is sound. Single-page vertical scroll works well. Tabs not needed—would add friction (GPU polling state comparison, form resubmit across tabs). Full-page layout is scannable on desktop, responsive below 700px. Recommendation: approve as-is; revisit tabs only if scope grows (multi-Ollama, clustering). Minor polish: indicator for active GPU polling, empty state hint on Model Details panel.
- **Approval Verdict (2026-04-19):** Trinity approved with minor polish recommendations. However, Switch's accessibility audit identified blockers (WCAG 2.1 Level A violations) that gate approval. Morpheus approved the no-tabs decision (Decision #5). Approval is blocked on Switch's accessibility fixes (Decision #4, ~90 min work).
- **UX Implementation Complete (2026-04-19):** Trinity implemented all five fixes from Decision #6 (hierarchy, labels, focus-visible, focus management, keyboard activation). All WCAG 2.1 Level A violations resolved. Switch re-review returned APPROVE WITH FOLLOW-UP. Code merged; typecheck and build pass. Minor follow-up: focus restoration after deletion could prefer next surviving model action (v2 refinement, non-blocking).
- **Interaction Patterns:** Forms propagate state back to views without phantom states. Search + filter chips work smoothly. Model card selection shows lifecycle state via blue border. Activity log provides audit trail of operations.
- **Vanilla DOM works here:** No framework overhead. Event listeners are explicit. State object is central. Re-render functions (e.g., `updateModelsDisplay()`, `renderRecommendations()`) are clear entry points for UI changes.
- **File structure:** `public/index.html` (templates + structure), `public/styles.css` (layout + theming + responsive), `public/app.ts` (1217 lines; split by section: event wiring, refresh loops, renders, helpers). Styled cleanly with CSS Grid, no component abstraction layer needed yet.
- **Live UX verdict (2026-04-19):** Based on the running app with 24 visible models and the captured scroll/focus behavior, the current UX should not be approved yet. The single-page stack is still the right structure, but the page makes users scan through four operations-heavy panels before reaching Installed Models, and opening Details scrolls deep without moving focus, which breaks orientation. Tabs would not materially improve this because model discovery, detail review, and activity are one coupled workflow; the right fix is to promote Installed Models + Model Details higher, then add intentional in-page navigation and focus handling.
- **Custom model guidance (2026-04-19):** The best place for Modelfile examples is directly under the Create Custom Model form, not buried in docs. A few short copy-ready snippets plus three concrete heuristics (start from a pulled base, change one parameter at a time, keep each variation under a new name) make the workflow clearer without adding new UI mechanics.

## 2026-04-19: Custom Model Examples — Decision #8 Approved

**Scribe Checkpoint**: Trinity implemented custom model examples in the Create Custom Model form; Switch reviewed and returned APPROVE WITH OBSERVATION.

Work completed:
1. **UI Enhancement**: Added three copy-ready Modelfile examples (coding helper, support triage, strict JSON) to the Create form placeholder
2. **Guidance**: Added inline safe-iteration checklist to help first-time users avoid common mistakes
3. **Validation**: npm run typecheck ✓, npm run build ✓, live app verification ✓
4. **Review**: Switch approved with non-blocking observation: manual copy/paste is acceptable for v1; could add direct copy-to-input affordance in v2

Status: ✅ Shipped as-is. Decision #8 captured in decisions.md. No blockers remain for this work cycle.

---

## 2026-04-19: Live UX Gate — Trinity's Hierarchy Review Confirmed

**Scribe Checkpoint**: Live app review conducted on http://127.0.0.1:3090 with Tank confirming live Ollama data and 24 visible models.

Evidence collected:
1. **Installed Models location**: Section begins ~1851px down the page; Model Details begins ~4707px down.
2. **System controls priority**: System Profile, GPU Monitor, Pull, Create all appear before the primary model-management workflow (Install, Search, List, Delete, Review).
3. **Hierarchy impact**: Page is scannable once Installed Models is reached (24 models render cleanly), so the issue is section priority, not raw density.
4. **Details orientation**: Clicking a Details button scrolls to the panel but leaves focus on `BODY`, increasing cognitive cost and keyboard navigation friction.

**Consensus**: Single-page structure is confirmed as the right product shape. Tabs would not materially help because the workflow is tightly coupled (find → inspect → update/delete → review activity). The real fix is re-ranking: move Installed Models + Model Details higher; collapsible sections (GPU, System Profile) lower.

**Merged Decision**: Decision #6 consolidates Trinity's hierarchy + Switch's accessibility findings into one gated decision with clear fix list and effort estimates.

**Next**: Re-rank page after accessibility fixes; Switch re-verifies keyboard workflows.

---
