
const { upstream, normalizeAthlete, normalizeSearchPayload } = require("./_worldathletics");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing search query" });

    if (/^\d{6,10}$/.test(q)) {
      const raw = await upstream(`/athletes/${encodeURIComponent(q)}`);
      return res.status(200).json([normalizeAthlete(raw)]);
    }

    const raw = await upstream(`/athletes/search?name=${encodeURIComponent(q)}`);
    return res.status(200).json(normalizeSearchPayload(raw));
  } catch (error) {
    return res.status(502).json({
      error: error?.name === "AbortError"
        ? "Athlete data source timed out"
        : (error?.message || "Athlete data source unavailable")
    });
  }
};
