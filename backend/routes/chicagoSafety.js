// backend/routes/chicagoSafety.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");   // ✅ 추가

const router = express.Router();

// 1) GeoJSON 로드
const communityGeoJsonPath = path.join(
  __dirname,
  "..",
  "data",
  "chicago",
  "community_areas.geojson"
);

let communityGeoJson = { type: "FeatureCollection", features: [] };

try {
  const raw = fs.readFileSync(communityGeoJsonPath, "utf8");
  communityGeoJson = JSON.parse(raw);
  console.log("✅ Loaded Chicago community areas GeoJSON");
} catch (err) {
  console.error(
    "⚠️  Failed to load community_areas.geojson:",
    communityGeoJsonPath,
    err.message
  );
}

// 더미 통계 생성 (이미 있던 함수일 거야)
function generateDummyStats(index) {
  const base = (index * 37) % 100;
  const crimeCount = 50 + base * 3; // 50~350
  let safetyScore = 10;
  if (crimeCount > 300) safetyScore = 2;
  else if (crimeCount > 200) safetyScore = 4;
  else if (crimeCount > 120) safetyScore = 6;
  else if (crimeCount > 80) safetyScore = 8;

  return { crimeCount, safetyScore }; // safetyScore: 2/4/6/8/10
}

/**
 * 기존: 영역 전체 GeoJSON 반환
 * GET /api/safety/chicago/areas
 */
router.get("/safety/chicago/areas", async (req, res) => {
  try {
    const features = communityGeoJson.features.map((f, idx) => {
      const { crimeCount, safetyScore } = generateDummyStats(idx);

      return {
        ...f,
        properties: {
          ...f.properties,
          crime_count: crimeCount,
          safety_score: safetyScore,
        },
      };
    });

    return res.json({
      type: "FeatureCollection",
      features,
    });
  } catch (err) {
    console.error("Error in /safety/chicago/areas:", err);
    return res.status(200).json({
      type: "FeatureCollection",
      features: [],
    });
  }
});

/**
 * ✅ 새로 추가: 특정 좌표의 안전 점수/등급
 * GET /api/safety/chicago/point?lat=..&lng=..
 */
router.get("/safety/chicago/point", (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat, lng required" });
  }

  const point = turf.point([parseFloat(lng), parseFloat(lat)]);

  // 이 좌표가 어느 커뮤니티 에어리어 안에 있는지 찾기
  let matchedIndex = -1;
  let matchedFeature = null;

  communityGeoJson.features.some((f, idx) => {
    if (turf.booleanPointInPolygon(point, f)) {
      matchedIndex = idx;
      matchedFeature = f;
      return true;
    }
    return false;
  });

  if (matchedIndex === -1 || !matchedFeature) {
    // 시카고 밖이면 대충 기본값
    return res.json({
      score: 60,
      grade: "C",
      city: "Unknown",
      areaName: null,
    });
  }

  const { crimeCount, safetyScore } = generateDummyStats(matchedIndex); // 2/4/6/8/10

  // 1~10 → 0~100 스케일
  const score100 = safetyScore * 10;

  // 등급 매핑
  let grade = "D";
  if (score100 >= 85) grade = "A";
  else if (score100 >= 70) grade = "B";
  else if (score100 >= 55) grade = "C";

  return res.json({
    score: score100,
    grade,
    city: "Chicago",
    areaName: matchedFeature.properties.community,
    raw: {
      safetyScore10: safetyScore,
      crimeCount,
    },
  });
});

module.exports = router;