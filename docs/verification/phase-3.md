# Phase 3 verification: API tester

Independent, read-only sub-agent. It exercised the running server with real requests, ran its own instances on other ports for training and fuzzing, and consumed the live WebSocket stream.

## Round 1: FAIL (criteria 4 and 9; criterion 2 partial)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Clean startup, model loaded once, inference never retrains | PASS | Startup log has no tracebacks; `model loaded` logged once per process; 120 concurrent requests and 32 concurrent identical predicts gave one identical probability. |
| 2 | Every endpoint works | PARTIAL | All 16 REST routes and the WebSocket answered. Inline predict returned 500 on several inputs. |
| 3 | No model gives a clear "not trained" state | PASS | With empty model dirs: status and metrics return `trained: false` with 200; predict, batch and upload return 409 `model_not_trained`; no 500s. |
| 4 | CSV upload robustness | FAIL | A 9 MB single-line file hung the whole server; single-column files were mis-parsed. Size limit, extension and content-type checks, binary detection, injection payloads, column mapping and missing values all held. |
| 5 | Prediction response contents | PASS | 12 test-split samples matched `test_predictions.csv`; probabilities sum to 1; processed views, three explanation methods and varying real timings present. |
| 6 | Training manager | PASS | 12 simultaneous starts gave one 202 and eleven 409; a stopped run left all model files unchanged by hash; stream values equal `/api/training/history`; hot swap confirmed by a changed model hash and changed predictions; 60 clients and a mid-run disconnect handled; a forced failure left the old model serving. |
| 7 | Validation, structured errors, logging, CORS, `.env.example` | PASS | All 4xx responses use the JSON envelope; CORS follows `EXOSCOPE_CORS_ORIGINS`. |
| 8 | pytest | PASS | 62 passed, no skips. |
| 9 | Crash hunt | FAIL | Six inline-predict inputs returned 500, with tracebacks in the log. |

Integrity violations: none found.

### Bugs and fixes

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | High | A single-line 9 MB upload hung the server (pandas delimiter sniffing with the Python engine) | Delimiter is now detected from the first row (comma, tab, semicolon, whitespace, else one column) and parsed with the C engine; an over-long first row is rejected at once; column count capped. |
| 2 | High | Inline predict returned 500 on empty, all-null, all-zero and overflowing inputs | `clean_series` handles empty arrays; emptiness and overflow are checked after detrending and clipping; usable-point count is validated before any work. All now return 422 `cannot_process`. |
| 3 | Medium | Single-column CSVs were mis-parsed; a headerless CSV lost its first row | Explicit delimiter detection; a first row that is entirely numeric is treated as data and columns are numbered (`has_header: false` in the response and the UI). |
| 4 | Low | Constant signals got a confident classification | Box Least Squares now refuses when no dip is found (422). With a supplied ephemeris and a flat input, the response carries a `warnings` entry, as it does for a weak BLS signal. |
| 5 | Low | `validating` contained the BLS search; `extracting_features` was only the standardizer | `ephemeris_search` is its own timed stage; `normalizing` is clean, detrend, clip; `extracting_features` is fold, bin, standardize. |
| 6 | Low | 500 responses had no CORS headers; WebSocket accepted any origin; failure messages exposed absolute paths | Catch-all middleware now sits inside CORS; the WebSocket rejects origins not in the allow list (clients without an Origin header are accepted); failure messages are reduced to file names. |
| 7 | Low | `file_too_large` reported a wrong size; batch events had no `epoch`; a second stop emitted a duplicate event; the work dir survived a failed run | All four fixed. |

20 regression tests were added (82 backend tests in total).

Not changed, documented as known limits: the request body is fully received before a 413; model promotion is not atomic (model file first, then configs); a disallowed-origin preflight returns Starlette's plain-text body; an auto-detected non-numeric time column falls back to the assumed cadence, which the response reports.

## Round 2: PASS

Criteria 2, 4 and 9 pass. Evidence from the re-check:

- Pathological uploads (single-line files up to 9 MB, 9 MB of commas, quotes, spaces or newlines, 3 million delimiter-only lines, 3,400 columns) all return a 4xx in at most 0.15 s; a health probe every 0.1 s during the run had a median of 1 ms and a maximum of 57 ms.
- About 100 degenerate inline inputs returned only 200 or 422. The server log has 0 tracebacks and 0 status-500 responses.
- Single-column, headerless, tab, semicolon and space-delimited files parse correctly.
- A forced real 500 carries `access-control-allow-origin` for an allowed origin and not for a disallowed one.
- The WebSocket accepts `http://localhost:3001`, `http://127.0.0.1:3000` and no-Origin clients, and rejects five disallowed variants.
- 25 random test-split predictions equal `test_predictions.csv` to 1.5e-7 after the default model was retrained.

Three new low-severity findings from round 2, all fixed afterwards: failure messages still exposed absolute paths for model directories outside the repo (now any absolute path is reduced to its file name); the upload preview echoed arbitrarily long cell values (now truncated to 40 characters); a header row of `nan,inf` was read as data (a header is now any row that is not entirely finite numbers).
