import { useState } from "react";
import { fetchStayScore } from "./api/stayScore";
import MapComponent from "./MapComponent";  // 만들어둔 지도 컴포넌트 임포트

function App() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null);

  async function handleAnalyze() {
    const data = await fetchStayScore(address);
    setResult(data);
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Stay Score</h1>

      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="주소 입력"
      />

      <button onClick={handleAnalyze}>분석하기</button>

      {/* ---------------- 점수 출력 ---------------- */} 
      {result && (
        <div>
          <h3>접근성: {result.scores.access.score}</h3>
          <h3>편의성: {result.scores.convenience.score}</h3>
          <h3>대중교통: {result.scores.transit.score}</h3>
        </div>
      )}

      {/* ---------------- 지도 표시 (이 줄이 바로 이거!!) ---------------- */}
      {result && (
        <MapComponent
          lat={result.query.lat}
          lng={result.query.lng}
        />
      )}

    </div>
  );
}

export default App;
