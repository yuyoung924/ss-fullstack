// backend/safety/cities/toronto.js
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

const {
  getAreaKm2,
  densityToSafetyScore,
  scoreToGrade,
} = require("../scoring");

// ⚠️ Node 18+ 라고 가정하고 global fetch 사용
// 만약 에러 나면 이 줄 대신:  import fetch from "node-fetch"; (ESM 파일로 바꾸기)
// 또는 const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));

// -------------------------------
// 1) GeoJSON 로드 (그대로 유지)
// -------------------------------
const torontoGeoJsonPath = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "canada",
  "toronto_neighbourhoods.geojson"
);

let torontoGeoJson = { type: "FeatureCollection", features: [] };

try {
  const raw = fs.readFileSync(torontoGeoJsonPath, "utf8");
  torontoGeoJson = JSON.parse(raw);
  console.log(
    "✅ [Toronto] neighbourhoods.geojson loaded:",
    torontoGeoJson.features.length,
    "features"
  );
} catch (e) {
  console.error(
    "⚠️ [Toronto] Failed to load neighbourhood geojson:",
    e.message
  );
  torontoGeoJson = { type: "FeatureCollection", features: [] };
}

// -------------------------------
// 2) TPS Open Data API에서 범죄 데이터 가져오기
// -------------------------------

// ArcGIS Feature Service (MCI Open Data) 레이어
// https://services.arcgis.com/S9th0jAJ7bqgIRjw/arcgis/rest/services/Major_Crime_Indicators_Open_Data/FeatureServer/0
const TORONTO_MCI_API =
  "https://services.arcgis.com/S9th0jAJ7bqgIRjw/arcgis/rest/services/Major_Crime_Indicators_Open_Data/FeatureServer/0/query";

// ArcGIS 레이어 설정상 Max Record Count = 2000 이라서
// resultOffset/recordCount 써서 페이지네이션 해야 함.
async function fetchTorontoCrimePoints() {
  const allPoints = [];
  const maxRecordCount = 2000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      f: "geojson",
      where: "OCC_YEAR >= 2023", // 예전 CSV 필터랑 맞춤
      outFields: "LAT_WGS84,LONG_WGS84,OCC_YEAR",
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(maxRecordCount),
    });

    const url = `${TORONTO_MCI_API}?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        `[Toronto] TPS API error ${res.status} ${res.statusText}`
      );
    }

    const data = await res.json();
    const features = data.features || [];

    for (const ft of features) {
      const geom = ft.geometry;
      if (!geom || !Array.isArray(geom.coordinates)) continue;
      const [lng, lat] = geom.coordinates;
      if (typeof lat === "number" && typeof lng === "number") {
        allPoints.push({ lat, lng });
      }
    }

    console.log(
      `[Toronto] TPS API chunk fetched: ${features.length} records (offset=${offset})`
    );

    if (features.length < maxRecordCount) {
      hasMore = false;
    } else {
      offset += features.length;
    }
  }

  console.log(
    `[Toronto] TPS API total crime points fetched: ${allPoints.length}`
  );
  return allPoints;
}

// -------------------------------
// 3) 유틸 & 캐시
// -------------------------------
function getAreaNameFromFeature(f) {
  const p = f.properties || {};
  return p.name || p.NAME || p.NEIGHBOURHOOD || "Unknown";
}

let crimeStatsCache = null; // { [areaName]: count }
let crimeStatsCacheTime = 0;
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4시간

async function computeCrimeStats() {
  const now = Date.now();
  if (crimeStatsCache && now - crimeStatsCacheTime < CACHE_TTL) {
    return crimeStatsCache;
  }

  const stats = {};
  try {
    // 1) 구역 이름 초기화
    for (const f of torontoGeoJson.features) {
      const name = getAreaNameFromFeature(f);
      stats[name] = 0;
    }

    // 2) TPS API에서 포인트 가져오기
    const crimePoints = await fetchTorontoCrimePoints();

    // 3) 포인트 → polygon 매칭
    for (const p of crimePoints) {
      const point = turf.point([p.lng, p.lat]);

      for (const f of torontoGeoJson.features) {
        try {
          if (turf.booleanPointInPolygon(point, f)) {
            const name = getAreaNameFromFeature(f);
            stats[name] = (stats[name] || 0) + 1;
            break;
          }
        } catch (e) {
          console.error("[Toronto] turf.booleanPointInPolygon error:", e);
        }
      }
    }

    console.log("[Toronto] Crime counts computed from TPS API.");
  } catch (e) {
    console.error("[Toronto] computeCrimeStats error:", e);
  }

  crimeStatsCache = stats;
  crimeStatsCacheTime = now;
  return stats;
}

// -------------------------------
// 4) 인터페이스 구현
// -------------------------------

// GET /api/safety/toronto/areas
async function getAreaFeatures() {
  try {
    const stats = await computeCrimeStats();

    const features = torontoGeoJson.features.map((f) => {
      const areaName = getAreaNameFromFeature(f);
      const crimeCount = stats[areaName] || 0;

      const areaKm2 = getAreaKm2(f);
      const density = crimeCount / areaKm2;
      const safetyScore = densityToSafetyScore(density);

      return {
        ...f,
        properties: {
          ...f.properties,
          city: "Toronto",
          area_name: areaName,
          area_km2: areaKm2,
          crime_count: crimeCount,
          crime_density_per_km2: density,
          safety_score: safetyScore,
        },
      };
    });

    return {
      type: "FeatureCollection",
      features,
    };
  } catch (e) {
    console.error("[Toronto] getAreaFeatures error:", e);
    return { type: "FeatureCollection", features: [] };
  }
}

// GET /api/safety/toronto/point?lat=&lng=
async function getPointScore(lat, lng) {
  try {
    const point = turf.point([parseFloat(lng), parseFloat(lat)]);
    let matched = null;

    for (const f of torontoGeoJson.features) {
      if (turf.booleanPointInPolygon(point, f)) {
        matched = f;
        break;
      }
    }

    if (!matched) {
      return {
        score: 70,
        grade: "B",
        city: "Toronto",
        areaName: null,
      };
    }

    const areaName = getAreaNameFromFeature(matched);
    const stats = await computeCrimeStats();
    const crimeCount = stats[areaName] || 0;

    const areaKm2 = getAreaKm2(matched);
    const density = crimeCount / areaKm2;

    const safety10 = densityToSafetyScore(density);
    const score100 = safety10 * 10;
    const grade = scoreToGrade(score100);

    return {
      score: score100,
      grade,
      city: "Toronto",
      areaName,
      raw: {
        areaKm2,
        crimeCount,
        crimeDensityPerKm2: density,
        safetyScore10: safety10,
      },
    };
  } catch (e) {
    console.error("[Toronto] getPointScore error:", e);
    return {
      score: 70,
      grade: "B",
      city: "Toronto",
      areaName: null,
    };
  }
}

module.exports = {
  cityCode: "toronto",
  displayName: "Toronto",
  getAreaFeatures,
  getPointScore,
};
