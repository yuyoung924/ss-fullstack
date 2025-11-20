// backend/routes/safety.js
const express = require("express");
const router = express.Router();

// 도시별 어댑터
const chicago = require("../safety/cities/chicago");
const london = require("../safety/cities/london");
const toronto = require("../safety/cities/toronto");
// 나중에 seoul, la 추가하면 여기에서 import

const CITY_SERVICES = {
  chicago,
  london,
  toronto,
};

function getService(cityParam) {
  if (!cityParam) return null;
  const key = cityParam.toLowerCase();
  return CITY_SERVICES[key] || null;
}

// GET /api/safety/:city/areas
router.get("/safety/:city/areas", async (req, res) => {
  const service = getService(req.params.city);
  if (!service) return res.status(404).json({ error: "Unknown city" });

  try {
    const fc = await service.getAreaFeatures();
    res.json(fc);
  } catch (e) {
    console.error(`[${service.cityCode}] areas error:`, e);
    res.json({ type: "FeatureCollection", features: [] });
  }
});

// GET /api/safety/:city/point?lat=&lng=
router.get("/safety/:city/point", async (req, res) => {
  const service = getService(req.params.city);
  if (!service) return res.status(404).json({ error: "Unknown city" });

  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat, lng required" });
  }

  try {
    const result = await service.getPointScore(lat, lng);
    res.json(result);
  } catch (e) {
    console.error(
      `[${service.cityCode}] point error for lat=${lat}, lng=${lng}:`,
      e
    );
    res.status(500).json({ error: "safety point error" });
  }
});

module.exports = router;
