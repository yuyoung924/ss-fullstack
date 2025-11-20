// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const stayScoreRouter = require("./routes/stayScore");
const safetyRouter = require("./routes/safety");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 공통 prefix = /api
app.use("/api", stayScoreRouter);      // /api/stay-score
app.use("/api", safetyRouter);

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
