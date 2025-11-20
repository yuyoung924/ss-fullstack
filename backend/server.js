// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const stayScoreRouter = require("./routes/stayScore");
const chicagoSafetyRouter = require("./routes/chicagoSafety"); // 아까 만든 시카고 전용 라우터

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 공통 prefix = /api
app.use("/api", stayScoreRouter);      // /api/stay-score
app.use("/api", chicagoSafetyRouter);  // /api/safety/chicago/...

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
