# Project Context

- **Owner:** kdcllc
- **Project:** UI and local HTTP service for managing Ollama models, custom Modelfiles, metadata, and hardware-aware optimization guidance.
- **Stack:** Node.js 18+, TypeScript, Express, browser UI in `public/`, compiled artifacts in `dist/`, npm package with `npx` entrypoint
- **Created:** 2026-04-19T10:37:30.160Z

## Learnings

- Team initialized with Trinity as Frontend Dev.
- **UX Review (2026-04-19):** Current layout hierarchy is sound. Single-page vertical scroll works well. Tabs not needed—would add friction (GPU polling state comparison, form resubmit across tabs). Full-page layout is scannable on desktop, responsive below 700px. Recommendation: approve as-is; revisit tabs only if scope grows (multi-Ollama, clustering). Minor polish: indicator for active GPU polling, empty state hint on Model Details panel.
- **Approval Verdict (2026-04-19):** Trinity approved with minor polish recommendations. However, Switch's accessibility audit identified blockers (WCAG 2.1 Level A violations) that gate approval. Morpheus approved the no-tabs decision (Decision #5). Approval is blocked on Switch's accessibility fixes (Decision #4, ~90 min work).
- **Interaction Patterns:** Forms propagate state back to views without phantom states. Search + filter chips work smoothly. Model card selection shows lifecycle state via blue border. Activity log provides audit trail of operations.
- **Vanilla DOM works here:** No framework overhead. Event listeners are explicit. State object is central. Re-render functions (e.g., `updateModelsDisplay()`, `renderRecommendations()`) are clear entry points for UI changes.
- **File structure:** `public/index.html` (templates + structure), `public/styles.css` (layout + theming + responsive), `public/app.ts` (1217 lines; split by section: event wiring, refresh loops, renders, helpers). Styled cleanly with CSS Grid, no component abstraction layer needed yet.
