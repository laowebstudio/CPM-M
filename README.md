# CPM Dashboard — ແຜນຄວບຄຸມວຽກກໍ່ສ້າງ

A static website (no build step, no server needed) that turns the 161-activity
construction schedule from `Project_Mangement.xlsx` into an interactive
**Critical Path Method** dashboard:

- **Overview** — WBS phase breakdown and duration timeline
- **Network Diagram** — Activity-on-Node (AON) CPM network, critical path highlighted in red, click any node for ES/EF/LS/LF/TF
- **Gantt** — calendar-based bar chart from the planned start/end dates
- **Table** — sortable, searchable table of all 161 activities with ES/EF/LS/LF/TF

All CPM math (forward pass, backward pass, total float, critical path) is
pre-computed in `data.json` — the site itself is just `index.html` + `style.css`
+ `app.js` reading that file, so it works on GitHub Pages with zero configuration.

## Files

```
index.html    the page
style.css     blueprint/drafting-table theme
app.js        renders overview, network diagram, gantt, table
data.json     161 activities + computed ES/EF/LS/LF/TF/critical flag
```

## Run locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly by double-clicking may be blocked by the
browser's fetch/CORS rules for local files — use a server instead.)

## Publish to GitHub Pages

1. Create a new repository on GitHub (e.g. `cpm-dashboard`), no README/license needed.
2. In this folder:
   ```bash
   git init
   git add .
   git commit -m "CPM dashboard: 161 activities, ES/EF/LS/LF/TF, network + gantt"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source → Deploy from a branch → `main` / `(root)`** → Save.
4. After a minute your site is live at
   `https://<your-username>.github.io/<repo-name>/`

## Notes on the CPM calculation

- Forward pass: `ES = EF(predecessor)` for Finish-to-Start links, `ES = ES(predecessor)`
  for Start-to-Start links; `EF = ES + duration`.
- Backward pass: mirrors the same logic from the project end date back to day 0.
- `TF = LS − ES`. An activity with `TF = 0` is on the **critical path**.
- In this schedule every activity has exactly one predecessor and one successor
  (a single sequential chain, occasionally overlapped with SS links) — so there
  is no parallel path to absorb float, and **all 161 activities come out critical**.
  If you edit `Project_Mangement.xlsx` to add parallel branches (an activity with
  more than one successor), re-run the extraction script to get real float values.

## Regenerating `data.json` from a new Excel file

The extraction/CPM script used to build `data.json` reads the `Construction Plan`
sheet (columns: order, code, WBS, task name, duration, predecessor, relationship,
resource, category, area, planned start, planned end, status) and the `WBS Summary`
sheet (for phase names). Re-run the same forward/backward pass logic against an
updated workbook to refresh the numbers.
