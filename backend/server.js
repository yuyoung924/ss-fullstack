require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

// 🔧 Google API 기본 URL
const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";

// =========================
// 1) 주소 → 위도/경도 변환
// =========================
async function geocodeAddress(address) {
  const url = `${GOOGLE_BASE}/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const res = await axios.get(url);
  if (!res.data.results || res.data.results.length === 0) return null;

  const loc = res.data.results[0].geometry.location;

  return {
    address: res.data.results[0].formatted_address,
    lat: loc.lat,
    lng: loc.lng,
  };
}

// =======================
// 2) 도심 접근성 (예: 서울 시청)
// =======================

// 도시 중심(CBD) 좌표 (원하면 더 추가 가능)
const CITY_CENTERS = {
  seoul: { name: "서울 시청", lat: 37.5665, lng: 126.9780 },
  busan: { name: "서면 중심부", lat: 35.1577, lng: 129.0592 },
  // 해외 도시들 네가 원하는 대로 더 넣기 가능
};

async function getAccessScore(lat, lng) {
  const center = CITY_CENTERS["seoul"]; // MVP → 기본 서울 기준

  const url = `${GOOGLE_BASE}/distancematrix/json?origins=${lat},${lng}&destinations=${center.lat},${center.lng}&mode=transit&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const res = await axios.get(url);
  const element = res.data.rows[0].elements[0];

  if (element.status !== "OK") return { score: 50, minutes: null };

  // 이동 시간 (초 → 분)
  const minutes = Math.round(element.duration.value / 60);

  // 점수 변환 (아주 단순화)
  let score = 100 - minutes;
  if (score < 20) score = 20;

  return {
    score,
    minutes,
    centerName: center.name,
  };
}

// =======================
// 3) 편의성 (반경 내 POI 개수)
// =======================
async function getConvenienceScore(lat, lng) {
  const categories = ["convenience_store", "supermarket", "cafe", "pharmacy"];

  let total = 0;
  let details = {};

  for (let type of categories) {
    const url = `${GOOGLE_BASE}/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=${type}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    const res = await axios.get(url);
    const count = res.data.results.length;

    details[type] = count;
    total += count;
  }

  // 단순 점수화
  const score = Math.min(100, total * 5);

  return { score, details };
}

// =======================
// 4) 대중교통 (가장 가까운 정류장)
// =======================
async function getTransitScore(lat, lng) {
  const url = `${GOOGLE_BASE}/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=bus_station&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const res = await axios.get(url);

  if (!res.data.results.length) {
    return { score: 40, nearest: null };
  }

  const nearest = res.data.results[0];

  // 단순 점수
  const score = Math.min(100, res.data.results.length * 10);

  return {
    score,
    nearest: {
      name: nearest.name,
      lat: nearest.geometry.location.lat,
      lng: nearest.geometry.location.lng,
    },
  };
}

// =======================
// 🎯 최종: Stay Score API
// =======================
app.get("/api/stay-score", async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) return res.status(400).json({ error: "address required" });

    // 1) 지오코딩
    const geo = await geocodeAddress(address);
    if (!geo) return res.status(404).json({ error: "Invalid address" });

    // 2) 접근성
    const access = await getAccessScore(geo.lat, geo.lng);

    // 3) 편의성
    const convenience = await getConvenienceScore(geo.lat, geo.lng);

    // 4) 대중교통
    const transit = await getTransitScore(geo.lat, geo.lng);

    return res.json({
      query: geo,
      scores: {
        access,
        convenience,
        transit,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
});

// =======================
app.listen(process.env.PORT, () =>
  console.log(`🚀 Stay Score backend running on ${process.env.PORT}`)
);
