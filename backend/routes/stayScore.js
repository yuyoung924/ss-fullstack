// backend/routes/stayScore.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";
const PLACES_BASE = "https://places.googleapis.com/v1";
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/* -------------------------------------------------------
 * 기존 Google Maps WebService 공통 요청
 * -----------------------------------------------------*/
async function callGoogleJson(url, params) {
  const res = await axios.get(url, {
    params: { key: API_KEY, ...params },
  });

  const data = res.data;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error("Google API error:", data);
    throw new Error(`Google API error: ${data.status}`);
  }
  return data;
}

/* -------------------------------------------------------
 * New Places API v1 - Nearby Search (max 20)
 * -----------------------------------------------------*/
async function searchNearbyPlaces(lat, lng, includedTypes, radiusMeters) {
  try {
    const body = {
      includedTypes,
      maxResultCount: 20, // Google 제한
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    };

    const res = await axios.post(
      `${PLACES_BASE}/places:searchNearby`,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask":
            "places.displayName,places.location,places.types",
        },
      }
    );

    return res.data.places || [];
  } catch (err) {
    console.error("NearbySearch error:", err.response?.data || err.message);
    return [];
  }
}

/* -------------------------------------------------------
 * New Places API v1 - Text Search (보조)
 * -----------------------------------------------------*/
async function searchPlacesText(lat, lng, query, radiusMeters) {
  try {
    const body = {
      textQuery: query,
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    };

    const res = await axios.post(
      `${PLACES_BASE}/places:searchText`,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "*",
        },
      }
    );

    return res.data.places || [];
  } catch (err) {
    console.error("TextSearch error:", err.response?.data || err.message);
    return [];
  }
}

/* -------------------------------------------------------
 * 1) Geocoding
 * -----------------------------------------------------*/
async function geocodeAddress(address) {
  const data = await callGoogleJson(`${GOOGLE_BASE}/geocode/json`, {
    address,
  });

  if (!data.results || !data.results.length) return null;

  const loc = data.results[0].geometry.location;

  return {
    address: data.results[0].formatted_address,
    lat: loc.lat,
    lng: loc.lng,
  };
}

/* -------------------------------------------------------
 * 거리 계산
 * -----------------------------------------------------*/
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/* -------------------------------------------------------
 * 경찰서 전용 검색
 *   - Google v1 공식 타입: "police"
 * -----------------------------------------------------*/
async function searchPoliceStations(lat, lng, radius) {
  let places = await searchNearbyPlaces(lat, lng, ["police"], radius);

  // 주변 지구대/파출소가 placeType에 없을 경우 검색 보조
  if (places.length < 1) {
    const extra = await searchPlacesText(lat, lng, "경찰서", radius);
    const extra2 = await searchPlacesText(lat, lng, "파출소", radius);
    const extra3 = await searchPlacesText(lat, lng, "지구대", radius);

    places = [...places, ...extra, ...extra2, ...extra3];
  }

  return places;
}

/* -------------------------------------------------------
 * 4) 편의성 점수 계산
 * -----------------------------------------------------*/
const FACILITY_TYPES = {
  convenienceStore: {
    placeType: "convenience_store",
    label: "편의점",
    cap: 20,
    weight: 0.35,
  },
  pharmacy: {
    placeType: "pharmacy",
    label: "약국",
    cap: 20,
    weight: 0.20,
  },
  hospital: {
    placeType: "hospital",
    label: "병원",
    cap: 20,
    weight: 0.25,
  },
  police: {
    placeType: "police",
    label: "경찰서",
    cap: 20,
    weight: 0.20,
  },
};

async function getConvenienceInfo(lat, lng) {
  const radius = 1000;
  const facilities = {};
  let normalizedSum = 0;

  for (const [key, cfg] of Object.entries(FACILITY_TYPES)) {
    let places = [];

    if (key === "police") {
      places = await searchPoliceStations(lat, lng, radius);
    } else {
      places = await searchNearbyPlaces(lat, lng, [cfg.placeType], radius);
    }

    const count = places.length;

    facilities[key] = { label: cfg.label, count };

    const ratio = Math.min(count / cfg.cap, 1);
    normalizedSum += ratio * cfg.weight;
  }

  const score = Math.round(60 + normalizedSum * 40);

  const totalCount = Object.values(facilities).reduce(
    (s, f) => s + f.count,
    0
  );

  return { score, totalCount, facilities };
}

/* -------------------------------------------------------
 * 지하철역 검색
 * -----------------------------------------------------*/
async function getNearestSubway(lat, lng) {
  const places = await searchNearbyPlaces(
    lat,
    lng,
    ["subway_station"],
    3000
  );

  if (!places.length) {
    return {
      station: {
        name: "3km 반경 내 지하철역이 없습니다.",
        distanceMeters: null,
        walkTimeText: null,
      },
      score: 40,
    };
  }

  let nearest = null;
  let minDist = Infinity;

  for (const p of places) {
    if (!p.location) continue;

    const dist = distanceMeters(
      lat,
      lng,
      p.location.latitude,
      p.location.longitude
    );

    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  }

  const distanceM = Math.round(minDist);
  const walkMinutes = Math.max(1, Math.round(distanceM / 80));

  const name = nearest.displayName?.text || "지하철역";

  return {
    score:
      distanceM <= 300
        ? 100
        : distanceM <= 600
        ? 90
        : distanceM <= 900
        ? 80
        : distanceM <= 1200
        ? 70
        : distanceM <= 1500
        ? 60
        : 50,
    station: {
      name,
      lat: nearest.location.latitude,
      lng: nearest.location.longitude,
      distanceMeters: distanceM,
      distanceText: `${distanceM}m`,
      walkTimeText: `${walkMinutes}분`,
    },
  };
}

/* -------------------------------------------------------
 * 메인 라우트
 * -----------------------------------------------------*/
router.get("/stay-score", async (req, res) => {
  try {
    const { address } = req.query;
    const latParam = req.query.lat ? parseFloat(req.query.lat) : null;
    const lngParam = req.query.lng ? parseFloat(req.query.lng) : null;

    let base;

    if (latParam && lngParam) {
      base = { address: address || null, lat: latParam, lng: lngParam };
    } else {
      if (!address)
        return res
          .status(400)
          .json({ error: "address 또는 lat,lng 중 하나가 필요합니다." });

      const geo = await geocodeAddress(address);
      if (!geo) return res.status(404).json({ error: "유효하지 않은 주소입니다." });

      base = geo;
    }

    const { lat, lng } = base;

    const [convenience, transit] = await Promise.all([
      getConvenienceInfo(lat, lng),
      getNearestSubway(lat, lng),
    ]);

    res.json({
      query: base,
      scores: {
        convenience,
        transit,
      },
    });
  } catch (err) {
    console.error("stay-score route error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

/* -------------------------------------------------------
 * 시설 리스트 조회 API
 * GET /api/nearby?lat=...&lng=...&type=...
 * 
 * 프론트: SafetyHeatMap → 바 클릭 후 이 API 호출
 * -----------------------------------------------------*/

router.get("/nearby", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const type = req.query.type;

    if (!lat || !lng || !type) {
      return res.status(400).json({ error: "lat, lng, type 모두 필요합니다." });
    }

    const url = `https://places.googleapis.com/v1/places:searchNearby`;

    const body = {
      includedTypes: [type],
      maxResultCount: 20, // Google Places v1 제한
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 1200, // 1.2km 반경
        },
      },
    };

    const placesRes = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask":
          "places.displayName,places.location,places.types",
      },
    });

    return res.json({
      ok: true,
      places: placesRes.data.places || [],
    });
  } catch (err) {
    console.error("Nearby API error:", err.response?.data || err);
    return res.status(500).json({
      error: "Nearby API 서버 오류",
    });
  }
});


module.exports = router;
