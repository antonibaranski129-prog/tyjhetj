
const BASES = [
  "https://worldathletics.nimarion.de",
  "https://worldathletics.pfingstsportfest.de"
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function upstream(path) {
  let lastError;
  for (const base of BASES) {
    try {
      const response = await fetchWithTimeout(base + path, {
        headers: {
          accept: "application/json",
          "user-agent": "WA-Progress-Lab/5.0"
        }
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error("Upstream returned invalid JSON"); }

      if (!response.ok) {
        throw new Error(data?.message || data?.error || `Upstream HTTP ${response.status}`);
      }
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("World Athletics data source is unavailable");
}

function first(...values) {
  return values.find(v => v !== undefined && v !== null && v !== "");
}

function normalizeSex(raw) {
  const v = String(raw || "").toLowerCase();
  if (["m","male","men","man"].includes(v) || v.includes("male")) return "Men";
  if (["f","female","women","woman"].includes(v) || v.includes("female")) return "Women";
  return null;
}

function normalizeAthlete(a = {}) {
  const firstName = first(a.firstname, a.firstName, a.givenName, a.given_name, a.forename);
  const lastName = first(a.lastname, a.lastName, a.familyName, a.family_name, a.surname);
  const name = first(a.name, a.fullName, [firstName, lastName].filter(Boolean).join(" "));
  return {
    id: first(a.id, a.athleteId, a.athlete_id, a.iaafId, a.iaaf_id),
    firstName: firstName || "",
    lastName: lastName || "",
    name: name || "Athlete",
    country: first(a.country, a.countryCode, a.country_code, a.nationality, a.nation) || "",
    birthDate: first(a.birthdate, a.birthDate, a.birth_date, a.dateOfBirth, a.dob) || "",
    sex: normalizeSex(first(a.sex, a.gender, a.sexName, a.sex_name, a.genderName)),
  };
}

function normalizeDiscipline(r = {}) {
  const d = first(r.discipline, r.event, r.eventName, r.disciplineName, r.name);
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return first(d.name, d.label, d.event) || "";
  return "";
}

function normalizeIndoor(r = {}) {
  const d = first(r.discipline, r.event);
  const raw = first(
    r.indoor, r.isIndoor, r.shortTrack,
    typeof d === "object" ? d.isIndoor : undefined
  );
  if (typeof raw === "boolean") return raw;
  const text = `${normalizeDiscipline(r)} ${first(r.venue, r.competition, "")}`.toLowerCase();
  if (text.includes("short track") || text.includes("indoor")) return true;
  return null;
}

function normalizeCompetition(r = {}) {
  const c = first(r.competition, r.competitionName, r.meeting, r.venue);
  if (typeof c === "string") return c;
  if (c && typeof c === "object") return first(c.name, c.venue, c.city) || "";
  const l = r.location;
  if (typeof l === "string") return l;
  if (l && typeof l === "object") return [l.venue,l.city,l.country].filter(Boolean).join(", ");
  return "";
}

function normalizeResult(r = {}) {
  return {
    date: String(first(r.date, r.competitionDate, r.competition_date, r.startDate, r.resultDate) || ""),
    discipline: normalizeDiscipline(r),
    mark: String(first(r.mark, r.result, r.performance, r.resultMark) || ""),
    place: first(r.place, r.rank, r.position, ""),
    competition: normalizeCompetition(r),
    indoor: normalizeIndoor(r),
    sourceScore: first(r.resultScore, r.score, r.points, null)
  };
}

function normalizeSearchPayload(data) {
  const list = Array.isArray(data) ? data : (data?.results || data?.athletes || []);
  return list.map(normalizeAthlete).filter(a => a.id);
}

function normalizeResultsPayload(data) {
  const list = Array.isArray(data) ? data : (data?.results || data?.performances || []);
  return list.map(normalizeResult).filter(r => r.discipline && r.mark);
}

module.exports = {
  upstream,
  normalizeAthlete,
  normalizeSearchPayload,
  normalizeResultsPayload
};
