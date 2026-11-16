# Phase 4 verification: UI tester

Independent, read-only sub-agent driving the production build in Chromium (Playwright) at 1440, 1024, 768 and 390 px. Its first session was cut short by a usage limit and overlapped with a backend hang caused by the Phase 3 tester; it was resumed against a healthy backend and re-ran every backend-dependent check.

## Round 1

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Landing page and synchronized hero | PASS | Headline, text and both CTAs present; six sections in order. Hero sampled 235 times over 10 s: planet and graph marker phases agree to 2e-16, the dip coincides with the planet being in front of the star in every frame, and the label switches in the same frames. Caption: "Illustration of the transit method. Not an observation; the dip is exaggerated." with a "Synthetic demonstration data" badge. |
| 2 | CTAs, links, buttons | PASS, with one bug | Both CTAs work; all 15 landing links resolve; all eight Explore cards land on the right heading; styled 404. Bug: Back button after an in-page anchor. |
| 3 | Dashboard shell | PASS | Eight sidebar links in order, each with the right URL, heading, title and one `aria-current`; collapse persists across reloads; page transition observed; shared empty, loading and error components present. |
| 4 | Responsive | FAIL | No horizontal page overflow on 36 route-and-width combinations; drawer works at 390 and 768 (opens, navigates, closes, Esc returns focus). One defect: a large number spilled out of its stat card at 1440 and 1024. |
| 5 | Data layer | PASS | One base URL from `NEXT_PUBLIC_API_BASE_URL`; status pill matches `GET /api/health`; simulated untrained, offline and recovery states behave; all landing figures match `/api/dataset/stats`; with the backend blocked, no numbers are shown. |
| 6 | No console, page or network errors | PASS | 36 of 36 combinations clean. |
| 7 | Accessibility basics | PASS, minor issues | Skip link first in tab order; visible focus on links and buttons; SVG labelled; icons hidden from assistive tech; reduced motion freezes the hero and the starfield. |
| 8 | Visual direction | PASS | Background `#050816`, cyan accent, starfield, glass cards, monospace figures. |

Integrity violations: none found. No hardcoded dataset statistics, metrics or predictions; the hero is labelled as a synthetic illustration; no discovery claims; no Kepler-90i claim.

### Issues and fixes

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | Medium | After clicking an in-page anchor and then a route link, Back showed the wrong page | Anchors now use the Next `Link` component, so history entries carry router state. |
| 2 | Medium | "184,995,022" overflowed its stat card at 1440 and 1024 | Smaller responsive type, tighter padding, and wrapping allowed. |
| 3 | Low-medium | No request timeout: a hung backend left "Connecting" forever | The API client aborts reads after 20 s and writes after 120 s with a clear timeout error. |
| 4 | Low | Collapsed sidebar animated from expanded on every load | Width transition removed. |
| 5 | Low | Scroll-reveal content invisible without JavaScript | A `noscript` style shows all reveal blocks. |
| 6 | Low | Focus ring hard to see on the cyan primary button | One global focus outline in near-white with an offset. |
| 7 | Low | Mobile menu button 32 px | Now 44 px. |
| 8 | Low | No section links on the mobile landing header; no skip link on the landing page | Section links show from 640 px up; skip link added. |
| 9 | Nit | Planet crossed right to left while the graph marker moves left to right | Planet now crosses left to right. |

Not changed: the dataset-figures block on the landing page keeps its own short loading and offline text.

## Round 2

The fixes were re-checked as part of the Phase 5 and Phase 6 UI verification, which re-ran the full click-through on the rebuilt app (see `phase-5.md` and `phase-6.md`).
