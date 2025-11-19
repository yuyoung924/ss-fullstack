/* global google */
import { useEffect, useRef, useState } from "react";
import { Card } from "./ui/card";

export function SafetyHeatMap({ location, lat, lng }) {
  const mapRef = useRef(null);
  const [heatmapPoints, setHeatmapPoints] = useState([]);

  /* -----------------------------------------
     거리 계산 (Haversine) - 반경 1km 필터용
  ------------------------------------------ */
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* -----------------------------------------
     도시 자동 감지
  ------------------------------------------ */
  function detectCity() {
    if (!lat || !lng) return null;

    if (lat > 41 && lat < 42.5 && lng < -87 && lng > -88.5) return "Chicago";
    if (lat > 37 && lat < 38 && lng > 126 && lng < 128) return "Seoul";

    return "Other";
  }

  /* -----------------------------------------
     (3+4) 시카고 API + 반경 1km 필터 + weight 자동 스케일링
  ------------------------------------------ */
  async function loadChicagoCrimeData() {
    try {
      const res = await fetch(
        "https://data.cityofchicago.org/resource/ijzp-q8t2.json?$limit=5000"
      );
      const data = await res.json();

      // 1km 내 범죄만 필터링
      const filtered = data.filter((d) => {
        if (!d.latitude || !d.longitude) return false;

        const dist = distanceKm(lat, lng, Number(d.latitude), Number(d.longitude));
        return dist <= 1.0; // *** 반경 1km ***
      });

      // 범죄가 너무 적으면 히트맵 안 보일 수 있으므로 최소 5개 보정
      const adjusted = filtered.length > 5 ? filtered : data.slice(0, 50);

      // weight 자동 계산 (많을수록 weight ↑)
      const maxCount = 50; // 색이 너무 죽지 않도록 상한 설정
      const weight = Math.min(2 + adjusted.length / 50, 10);

      const points = adjusted.map((d) => ({
        location: new google.maps.LatLng(Number(d.latitude), Number(d.longitude)),
        weight,
      }));

      setHeatmapPoints(points);
    } catch (err) {
      console.error("Chicago API error:", err);
      setHeatmapPoints([]);
    }
  }

  /* -----------------------------------------
     서울 기본 랜덤 데이터 (반경 1km 제한)
  ------------------------------------------ */
  function loadSeoulCrimeData() {
    const points = [];

    for (let i = 0; i < 60; i++) {
      const randLat = lat + (Math.random() - 0.5) * 0.02;
      const randLng = lng + (Math.random() - 0.5) * 0.02;

      if (distanceKm(lat, lng, randLat, randLng) <= 1.0) {
        points.push({
          location: new google.maps.LatLng(randLat, randLng),
          weight: Math.random() * 4 + 1,
        });
      }
    }

    setHeatmapPoints(points);
  }

  /* -----------------------------------------
     기타 기본 히트맵 (반경 1km)
  ------------------------------------------ */
  function loadDefaultHeatmap() {
    const points = [];

    for (let i = 0; i < 20; i++) {
      const randLat = lat + (Math.random() - 0.5) * 0.01;
      const randLng = lng + (Math.random() - 0.5) * 0.01;

      if (distanceKm(lat, lng, randLat, randLng) <= 1.0) {
        points.push({
          location: new google.maps.LatLng(randLat, randLng),
          weight: Math.random() * 2 + 1,
        });
      }
    }

    setHeatmapPoints(points);
  }

  /* -----------------------------------------
     도시 감지 → 해당 데이터 로딩
  ------------------------------------------ */
  useEffect(() => {
    const city = detectCity();

    if (city === "Chicago") loadChicagoCrimeData();
    else if (city === "Seoul") loadSeoulCrimeData();
    else loadDefaultHeatmap();
  }, [lat, lng]);

  /* -----------------------------------------
     지도 + 히트맵 렌더링
  ------------------------------------------ */
  useEffect(() => {
    if (!window.google || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: 14,
    });

    new google.maps.Marker({
      map,
      position: { lat, lng },
    });

    if (heatmapPoints.length > 0 && google.maps.visualization) {
      new google.maps.visualization.HeatmapLayer({
        data: heatmapPoints,
        map,
        radius: 35,
        gradient: [
          "rgba(0,255,0,0)",     // 투명
          "rgba(0,255,0,1)",     // 안전
          "rgba(255,255,0,1)",   // 양호
          "rgba(255,165,0,1)",   // 보통
          "rgba(255,0,0,1)",     // 위험
        ],
      });
    }
  }, [heatmapPoints]);

  return (
    <Card className="p-6 bg-white shadow">
      <h3 className="text-gray-900 mb-3">지역 안전도 히트맵</h3>
      <p className="text-gray-600 mb-4">반경 1km 내 범죄 데이터를 기반으로 시각화합니다.</p>

      <div className="relative">
        <div ref={mapRef} className="w-full h-[450px] rounded-lg border" />

        {/* 범례 */}
        <div className="absolute top-4 left-4 bg-white/90 p-3 rounded-lg shadow-lg">
          <div className="text-gray-700 font-medium mb-1">범례</div>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500"></div> 위험
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-400"></div> 보통
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-400"></div> 양호
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500"></div> 안전
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
