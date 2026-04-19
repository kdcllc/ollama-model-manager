# UX Structure Review

## Pattern

When deciding between a single-page stack and tabs, evaluate the workflow in this order:

1. **Task coupling:** If users need to move back and forth between sections to complete one job, keep them on one surface.
2. **Keyboard flow:** Prefer layouts where focus can progress linearly without hidden content or tab-panel state management.
3. **Hierarchy fit:** If the page feels heavy, fix ordering and prominence before introducing new navigation chrome.
4. **Escalation path:** Move to tabs only when major task groups are genuinely independent and users rarely cross between them in one session.

## Applied here

- If an item selection scrolls to another section, move keyboard focus with it or keep list/details adjacent; smooth scroll without focus transfer increases orientation cost.
- Installed Models, Model Details, and Activity are one workflow, so separating them into tabs would increase navigation cost.
- The better fix is to keep a single page and improve section order, labels, and in-page movement.
