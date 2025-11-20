// backend/safety/cities/london.js
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");
const fetch = require("node-fetch");

// 🔥 공통 스코어링 모듈
const {
  getAreaKm2,
  densityToSafetyScore,
  scoreToGrade,
} = require("../scoring");

// 1) Borough GeoJSON 경로
const londonGeoJsonPath = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "uk",
  "london_boroughs.geojson" // 네가 저장한 파일명에 맞춰서
);

let londonGeoJson = { type: "FeatureCollection", features: [] };

try {
  const raw = fs.readFileSync(londonGeoJsonPath, "utf8");
  const parsed = JSON.parse(raw);

  if (parsed.type === "FeatureCollection") {
    londonGeoJson = parsed;
  } else if (parsed.type === "Feature") {
    londonGeoJson = { type: "FeatureCollection", features: [parsed] };
  } else {
    console.warn("[London] Unknown GeoJSON type:", parsed.type);
  }

  console.log(
    "✅ [London] borough GeoJSON loaded:",
    londonGeoJson.features.length,
    "features"
  );
} catch (err) {
  console.error("⚠️ [London] Failed to load borough geojson:", err.message);
}

// ----------------- Police API 설정 -----------------
const POLICE_BASE_URL = "https://data.police.uk/api";
const DEFAULT_MONTH = "2024-06";

// borough별 crimeCount 캐시
let boroughStatsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6시간

async function fetchCrimesAroundPoint(lat, lng, month = DEFAULT_MONTH) {
  const url = `${POLICE_BASE_URL}/crimes-street/all-crime?date=${month}&lat=${lat}&lng=${lng}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Police API error: ${res.status}`);
  }
  const crimes = await res.json();
  return Array.isArray(crimes) ? crimes.length : 0;
}

function getAreaNameFromFeature(feature) {
  const p = feature.properties || {};
  return (
    p.area_name ||
    p.name ||
    p.NAME ||
    p.BOROUGH ||
    p.borough ||
    p.LAD13NM ||
    p.LAD16NM ||
    "Unknown"
  );
}

// borough별 crimeCount 계산 + 캐시
async function ensureBoroughStats() {
  const now = Date.now();
  if (boroughStatsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return boroughStatsCache;
  }

  const stats = {};
  for (const feature of londonGeoJson.features) {
    const areaName = getAreaNameFromFeature(feature);
    const centroid = turf.centroid(feature);
    const [lng, lat] = centroid.geometry.coordinates;

    let crimeCount = 0;
    try {
      crimeCount = await fetchCrimesAroundPoint(lat, lng);
    } catch (e) {
      console.error(`[London] Police API error for ${areaName}:`, e.message);
    }

    stats[areaName] = { crimeCount };
  }

  boroughStatsCache = stats;
  cacheTimestamp = now;
  return stats;
}

// ----------------- 공통 인터페이스 -----------------

// GET /api/safety/london/areas
async function getAreaFeatures() {
  const stats = await ensureBoroughStats();

  const features = londonGeoJson.features.map((f) => {
    const areaName = getAreaNameFromFeature(f);
    const crimeCount = stats[areaName]?.crimeCount ?? 0;

    // 🔥 공통 스코어링: 면적 → 밀도 → 점수
    const areaKm2 = getAreaKm2(f);
    const density = crimeCount / areaKm2;
    const safetyScore = densityToSafetyScore(density);

    return {
      ...f,
      properties: {
        ...f.properties,
        city: "London",
        area_name: areaName,
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

// GET /api/safety/london/point?lat=&lng=
async function getPointScore(lat, lng) {
  const point = turf.point([parseFloat(lng), parseFloat(lat)]);

  let matchedFeature = null;
  londonGeoJson.features.some((f) => {
    if (turf.booleanPointInPolygon(point, f)) {
      matchedFeature = f;
      return true;
    }
    return false;
  });

  if (!matchedFeature) {
    return {
      score: 70,
      grade: "B",
      city: "London",
      areaName: null,
    };
  }

  const areaName = getAreaNameFromFeature(matchedFeature);
  const stats = await ensureBoroughStats();
  const crimeCount = stats[areaName]?.crimeCount ?? 0;

  const areaKm2 = getAreaKm2(matchedFeature);
  const density = crimeCount / areaKm2;
  const safetyScore10 = densityToSafetyScore(density);
  const score100 = safetyScore10 * 10;
  const grade = scoreToGrade(score100);

  return {
    score: score100,
    grade,
    city: "London",
    areaName,
    raw: {
      areaKm2,
      crimeCount,
      crimeDensityPerKm2: density,
      safetyScore10,
    },
  };
}

module.exports = {
  cityCode: "london",
  displayName: "London",
  getAreaFeatures,
  getPointScore,
};
