# EvaluaHealth Full Audit

## Reported bugs
1. Live/Upcoming scope on a FUTURE assessment (2026-07-21):
   - Evaluation Tracker row shows "2 done" full green bar — WRONG (0 evals)
   - Evaluation Completion gauge = 100% — WRONG
   - Group Status by Site = green "Done" bar — WRONG
   - But "Evaluations Done"=0 + "No evaluations yet" — correct
2. Root cause hypothesis: "done"/completion uses studentTarget/panelSize where
   panelSize returns 3 when 0 evaluators started, and "done" check compares
   finishedEvals>=target but target computed wrong, OR completion treats
   "no cases / no panel" as 100%.

## Need to audit
- dashboard/page.tsx: panelSize, studentTarget, completion %, tracker "done", group status
- SiteTracker buildSiteRows: progress = fully-evaluated students / total
- caseStatus students page
- Reports zero-counts

## Findings (2026-06-26 — COMPLETE)
FIXED: false-done bug (target>0 && fin>=target) in SiteTracker + dashboard (3 spots).
VERIFIED CORRECT:
- Dashboard Live/Upcoming: future group 07-21 (0 cases) now gauge 0%, "2 unfinished/Needs attention". ✓
- Dashboard Last Assessment: 06-25 (528 stu, evals not started) all "0 done/N unfinished", gauge 0%. ✓
- Dashboard Historical: clean date list, gauge 0%, Group Status red Unfinished. ✓
- Reports: 06-24 Mexico=5 Total=5, others 0. (handover "zero bug" was stale/pre-seed). ✓
- Students group 06-24: test/Oscar green (2/2 panel done), Alexia/Chriss amber in-progress. Dynamic panel rule correct. ✓
- Evaluator dashboard: Completed=2, Pending=0, chart Jun24=2, activity correct. ✓
- Evaluator evaluate: "Not yet scheduled" (no group today) — correct gating. ✓
- Cases: 2 batches, 15 criterios each. ✓
- Locations: 4 (Mexico/Monterrey/New York/Puebla). ✓
tsc EXIT 0. No remaining bugs found.
