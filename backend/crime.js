import fetch from "node-fetch";
import express from "express";
const router = express.Router();

const APP_TOKEN = process.env.CHICAGO_APP_TOKEN; // .env에 저장

// 최신 범죄 데이터 가져오기 (최근 500개)
router.get("/crime/chicago", async (req, res) => {
  try {
    const limit = req.query.limit || 500;

    const url = `https://data.cityofchicago.org/resource/ijzp-q8t2.json?$limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        "X-App-Token": APP_TOKEN,
      },
    });

    const data = await response.json();

    // 필요한 필드만 추출 (좌표만)
    const cleaned = data
      .filter((d) => d.latitude && d.longitude)
      .map((d) => ({
        lat: parseFloat(d.latitude),
        lng: parseFloat(d.longitude),
        type: d.primary_type,
        date: d.date,
      }));

    res.json(cleaned);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Chicago crime data" });
  }
});

export default router;
