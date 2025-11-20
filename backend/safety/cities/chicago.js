// backend/safety/cities/chicago.js
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");
const fetch = require("node-fetch"); // npm install node-fetch@2 (이미 있으면 OK)

const {
  getAreaKm2,
  densityToSafetyScore,
  scoreToGrade,
} = require("../scoring");

// -------------------------
// 1) GeoJSON 로드
// -------------------------
const communityGeoJsonPath = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "chicago",
  "community_areas.geojson"
);

let communityGeoJson = { type: "FeatureCollection", features: [] };

try {
  const raw = fs.readFileSync(communityGeoJsonPath, "utf8");
  communityGeoJson = JSON.parse(raw);
  console.log(
    "✅ [Chicago] community_areas.geojson loaded:",
    communityGeoJson.features.length,
    "features"
  );
} catch (err) {
  console.error("⚠️ [Chicago] Failed to load geojson:", err.message);
  communityGeoJson = { type: "FeatureCollection", features: [] };
}

// -------------------------
// 2) Chicago Open Data API 설정
// -------------------------

// https://data.cityofchicago.org/resource/ijzp-q8t2.json
const CHICAGO_CRIME_URL =
  "https://data.cityofchicago.org/resource/ijzp-q8t2.json";

// 최근 1년 데이터 기준 (원하면 조절)
const CRIME_SINCE_DATE = "2024-01-01T00:00:00";

// .env 에서 CHICAGO_APP_TOKEN 읽기 (있으면 rate limit에서 유리)
const APP_TOKEN = process.env.CHICAGO_APP_TOKEN || null;

// community_area → crimeCount 캐시
let crimeStatsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1시간

// -------------------------
// 3) 유틸 함수들
// -------------------------

function getAreaNumberFromFeature(feature) {
  const p = feature.properties || {};
  return (
    p.area_numbe || // community_areas 기본 필드
    p.area_number ||
    p.area_num ||
    p.community_area ||
    null
  );
}

function getAreaNameFromFeature(feature) {
  const p = feature.properties || {};
  return (
    p.community ||
    p.community_name ||
    p.name ||
    `Area ${getAreaNumberFromFeature(feature) || "Unknown"}`
  );
}

// -------------------------
// 4) Chicago Crime API에서 community_area별 집계 가져오기
// -------------------------

async function fetchCrimeStats() {
  const params = new URLSearchParams({
    $select: "community_area, count(*) as crime_count",
    $group: "community_area",
    $where: `date >= '${CRIME_SINCE_DATE}'`,
  });

  const url = `${CHICAGO_CRIME_URL}?${params.toString()}`;
  console.log("[Chicago] Fetching crime stats:", url);

  const headers = {};
  if (APP_TOKEN) {
    headers["X-App-Token"] = APP_TOKEN;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Chicago crime API error: ${res.status}`);
  }

  const json = await res.json();
  const stats = {};
  for (const row of json) {
    const key = row.community_area;
    if (!key) continue;
    const count = Number(row.crime_count || row.count || 0);
    stats[key] = { crimeCount: count };
  }

  console.log(
    "[Chicago] Loaded crime stats for",
    Object.keys(stats).length,
    "community areas"
  );
  return stats;
}

async function ensureCrimeStats() {
  const now = Date.now();
  if (crimeStatsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return crimeStatsCache;
  }

  try {
    const stats = await fetchCrimeStats();
    crimeStatsCache = stats;
    cacheTimestamp = now;
    return stats;
  } catch (e) {
    console.error("[Chicago] Failed to fetch crime stats:", e.message);
    crimeStatsCache = {};
    cacheTimestamp = now;
    return crimeStatsCache;
  }
}

// -------------------------
// 5) 공통 인터페이스 구현
// -------------------------

// GET /api/safety/chicago/areas
async function getAreaFeatures() {
  const stats = await ensureCrimeStats();

  const features = communityGeoJson.features.map((f) => {
    const areaNumber = getAreaNumberFromFeature(f); // 예: "32"
    const areaName = getAreaNameFromFeature(f);

    let crimeCount = 0;
    if (areaNumber != null) {
      const key = String(areaNumber);
      crimeCount = stats[key]?.crimeCount ?? 0;
    }

    const areaKm2 = getAreaKm2(f);
    const density = crimeCount / areaKm2; // 건수 / km²
    const safetyScore = densityToSafetyScore(density);

    return {
      ...f,
      properties: {
        ...f.properties,
        city: "Chicago",
        area_name: areaName,
        community_area: areaNumber,
        area_km2: areaKm2,
        crime_count: crimeCount,
        crime_density_per_km2: density,
        safety_score: safetyScore, // 1~10
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

// GET /api/safety/chicago/point?lat=&lng=
async function getPointScore(lat, lng) {
  const point = turf.point([parseFloat(lng), parseFloat(lat)]);

  let matchedFeature = null;

  communityGeoJson.features.some((f) => {
    if (turf.booleanPointInPolygon(point, f)) {
      matchedFeature = f;
      return true;
    }
    return false;
  });

  if (!matchedFeature) {
    return {
      score: 60,
      grade: "C",
      city: "Chicago",
      areaName: null,
    };
  }

  const areaNumber = getAreaNumberFromFeature(matchedFeature);
  const areaName = getAreaNameFromFeature(matchedFeature);

  const stats = await ensureCrimeStats();
  let crimeCount = 0;
  if (areaNumber != null) {
    const key = String(areaNumber);
    crimeCount = stats[key]?.crimeCount ?? 0;
  }

  const areaKm2 = getAreaKm2(matchedFeature);
  const density = crimeCount / areaKm2;
  const safetyScore10 = densityToSafetyScore(density);
  const score100 = safetyScore10 * 10;
  const grade = scoreToGrade(score100);

  return {
    score: score100,
    grade,
    city: "Chicago",
    areaName,
    raw: {
      communityArea: areaNumber,
      areaKm2,
      crimeCount,
      crimeDensityPerKm2: density,
      safetyScore10,
    },
  };
}

module.exports = {
  cityCode: "chicago",
  displayName: "Chicago",
  getAreaFeatures,
  getPointScore,
};
