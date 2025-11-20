// backend/safety/scoring.js
const turf = require("@turf/turf");

/**
 * GeoJSON Feature의 면적(km^2)을 계산
 * - turf.area 는 m^2 기준이므로 1_000_000 으로 나눔
 * - 너무 작은 값은 0으로 나누기 방지를 위해 최소 0.01 km^2 로 보정
 */
function getAreaKm2(feature) {
  try {
    const areaM2 = turf.area(feature);
    const km2 = areaM2 / 1_000_000;
    return Math.max(km2, 0.01);
  } catch (e) {
    console.error("[Scoring] Failed to compute area:", e.message);
    return 1; // fallback
  }
}

/**
 * 범죄 밀도(연간 건수 / km^2) → 안전 점수 (1~10)
 * 숫자 구간은 나중에 튜닝 가능
 */
function densityToSafetyScore(density) {
  if (density <= 50) return 10;
  if (density <= 100) return 9;
  if (density <= 200) return 8;
  if (density <= 400) return 7;
  if (density <= 800) return 6;
  if (density <= 1200) return 5;
  if (density <= 1600) return 4;
  if (density <= 2000) return 3;
  if (density <= 2500) return 2;
  return 1;
}

/**
 * 0~100 점수 → 등급
 */
function scoreToGrade(score100) {
  if (score100 >= 85) return "A";
  if (score100 >= 70) return "B";
  if (score100 >= 55) return "C";
  return "D";
}

module.exports = {
  getAreaKm2,
  densityToSafetyScore,
  scoreToGrade,
};
