# tw-otc-data

Daily copies of the **public** official TPEx (上櫃) end-of-day datasets, for
[analysis-engine-handoff](https://github.com/liwenlide/analysis-engine-handoff), whose hosting cannot reach tpex.org.tw.

A GitHub Action runs on weekdays at 15:30 and 17:30 Taipei time and commits:

| Path | Source |
|---|---|
| `tpex/dailyQuotes/YYYY-MM-DD.json` | `afterTrading/dailyQuotes` (ordinary 4-digit stocks only, official JSON shape) |
| `tpex/valuation/YYYY-MM-DD.json` | `afterTrading/peQryDate` |
| `tpex/flows/YYYY-MM-DD.json` | `insti/dailyTrade` |
| `tpex/margin/YYYY-MM-DD.json` | `margin/balance` |
| `tpex/revenue-latest.json` | OpenAPI `mopsfin_t187ap05_O` |
| `tpex/latest.json` | latest saved date |

A file is written only when TPEx answers for that exact date; holidays write nothing.
To backfill a day: Actions → *TPEx daily snapshot* → Run workflow → enter the date.

Data © Taipei Exchange (證券櫃檯買賣中心), public market information.
