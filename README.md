# WA Progress Lab PRO

Production-ready Vercel project for athletics performance progression.

## Core product

### Athlete Progress
- Search by athlete name or World Athletics ID.
- Select one or multiple events.
- True season-best selection for every year.
- Convert each season best to 2025 World Athletics points.
- Plot multiple events together on one comparable WA-points chart.
- When exactly one event is selected, toggle between WA points and actual performance.
- Event-level PB / best score / first season / improvement cards.
- Season-best table and CSV export.

### Compare Athletes
- Add up to 6 athletes.
- Select one event.
- Compare season-best progression by:
  - calendar year
  - age on the exact date of the season best
- Toggle Y-axis:
  - actual performance
  - WA points
- Comparison table under the chart.

## Scoring

`scoring-data.js` contains the project scoring dataset from the 2025 World Athletics Scoring Tables.

The lookup follows the official table convention:
when a mark falls between table entries, the lower points score is used.

The app does not interpolate WA scores.

## Athlete data

Serverless API adapter:
- `/api/search?q=...`
- `/api/athlete?id=...`

Primary/fallback public third-party World Athletics data services:
- `worldathletics.nimarion.de`
- `worldathletics.pfingstsportfest.de`

The adapter normalizes athlete and result fields before returning them to the frontend.

## Deploy to Vercel

Upload these files to the root of the existing GitHub repository:

- `index.html`
- `styles.css`
- `app.js`
- `scoring-data.js`
- `package.json`
- `vercel.json`
- `api/`

Commit the changes. Vercel should redeploy automatically.

No environment variables are required for this version.

## Notes

This is an unofficial analytics project and not an official World Athletics product.
Third-party athlete-data services may change or become unavailable, which is why the external source is isolated in `api/_worldathletics.js`.
