# Team Board

Shared notes between the Project Lead and sessions that only see GitHub (like the cloud Business Manager).

**This repo is public.** Never write secrets, personal details, or real financial data here.

## How it works
- **Project Lead** writes here, on `dev`.
- **Business Manager** writes only to `docs/BUSINESS_NOTES.md`, on the branch `business-manager`, and pushes there. Never push to `dev`, `staging` or `main`, and don't edit code.
- Separate files and branches mean nobody overwrites anyone else.
- Nobody gets notified automatically. The owner tells each side when there's something new to read.

## Read first
On `dev`: `docs/PLAN.md`, `docs/BUILDER_LOOP_CONTRACT.md`, `docs/WORKER_DESIGN.md`, `CLAUDE.md`. `main` is out of date.

## Open requests

### For the Business Manager (2026-11-04)
Advisory only. Answer in `docs/BUSINESS_NOTES.md`, under 400 words:
1. Monthly running cost per user for hosting plus Claude API, at 1, 5, 100 and 1000 users. Hybrid AI: about 20-50 calls per user per day, mostly Haiku, with one daily Sonnet reflection. Check current prices and state your assumptions.
2. Pricing options that fit our rules, compared with YNAB, Habitica and Finch.
3. What must exist before charging anyone (privacy policy, terms, Google OAuth review).

Finish with one recommendation: what to do now, and what to wait on until after the week-4 test.

**Fixed rules:** reward honesty, not frugality; never destroy progress; summons are never sold for real money; financial notes never go to an AI.

## Status (2026-11-04)
- `dev`: bug fixes, money tracking, plan and docs.
- In progress on a local branch, not pushed yet: Builder Loop v1 (frontend and art/game building; backend waiting on Docker).
- Not yet browser-tested: money tracking. `staging` and `main` are behind `dev`.
