
const { upstream, normalizeAthlete, normalizeResultsPayload } = require("./_worldathletics");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
  try {
    const id = String(req.query.id || "").trim();
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "Invalid athlete ID" });

    const [athleteRaw, resultsRaw] = await Promise.all([
      upstream(`/athletes/${encodeURIComponent(id)}`),
      upstream(`/athletes/${encodeURIComponent(id)}/results`)
    ]);

    return res.status(200).json({
      athlete: normalizeAthlete(athleteRaw),
      results: normalizeResultsPayload(resultsRaw)
    });
  } catch (error) {
    return res.status(502).json({
      error: error?.name === "AbortError"
        ? "Athlete data source timed out"
        : (error?.message || "Unable to load athlete data")
    });
  }
};
