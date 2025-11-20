/* global google */
import { useEffect, useRef, useState } from "react";
import { Card } from "./ui/card";

export function SafetyHeatMap({
  location,
  city,                // ✅ App에서 넘겨받는 도시
  safetyScore,
  lat,
  lng,
  selectedFacilityType,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const [areaGeoJson, setAreaGeoJson] = useState(null); // ✅ 공통 이름
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [facilityMarkers, setFacilityMarkers] = useState([]);

  /* -----------------------------------------
     1. 도시별 영역 GeoJSON 가져오기
        (GET /api/safety/:city/areas)
  ------------------------------------------ */
  useEffect(() => {
    if (!city || city === "Other") return; // 지원 안 하는 도시는 패스

    async function fetchAreas() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const res = await fetch(
          `http://localhost:4000/api/safety/${city.toLowerCase()}/areas`
        );
        if (!res.ok) {
          throw new Error(`${city} 안전도 데이터를 불러오지 못했습니다.`);
        }
        const geojson = await res.json();
        setAreaGeoJson(geojson);
      } catch (err) {
        console.error("Safety areas API error:", err);
        setLoadError(err.message || "데이터 로딩 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchAreas();
  }, [city]);

  /* -----------------------------------------
     2. 구글맵 초기화
  ------------------------------------------ */
  useEffect(() => {
    if (!window.google || !mapRef.current || lat == null || lng == null) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat, lng });
      return;
    }

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: city && city !== "Other" ? 11 : 14,
    });

    // 현재 숙소 위치 마커
    new window.google.maps.Marker({
      map,
      position: { lat, lng },
    });

    mapInstanceRef.current = map;
  }, [lat, lng, city]);

  /* -----------------------------------------
     3. 폴리곤 색칠 (choropleth)
  ------------------------------------------ */
  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google || !map) return;

    // 기존 DataLayer 비우기
    map.data.forEach((feature) => {
      map.data.remove(feature);
    });

    if (city && city !== "Other" && areaGeoJson) {
      // GeoJSON 올리기
      map.data.addGeoJson(areaGeoJson);

      const getFillColor = (score) => {
        if (score >= 9) return "#006837"; // 매우 안전
        if (score >= 7) return "#66BB6A"; // 안전
        if (score >= 5) return "#FFEE58"; // 보통
        if (score >= 3) return "#FFA726"; // 주의
        return "#D32F2F"; // 위험
      };

      map.data.setStyle((feature) => {
        const score = feature.getProperty("safety_score") || 0;
        return {
          fillColor: getFillColor(score),
          fillOpacity: 0.7,
          strokeColor: "#555",
          strokeWeight: 1,
        };
      });

      // 클릭 시 정보창
      const infoWindow = new google.maps.InfoWindow();
      map.data.addListener("click", (e) => {
        const props = e.feature.getProperty.bind(e.feature);
        // 도시마다 필드명이 다를 수 있으니 area_name 우선, 없으면 community 사용
        const name = props("area_name") || props("community");
        const score = props("safety_score");
        const crimes = props("crime_count");
        const position = e.latLng;

        const content = `
          <div style="font-size:13px;">
            <div style="font-weight:600; margin-bottom:4px;">${name}</div>
            <div>안전 점수: <b>${score}</b> / 10</div>
            <div>범죄 건수(예시): <b>${crimes}</b>건</div>
          </div>
        `;

        infoWindow.setContent(content);
        infoWindow.setPosition(position);
        infoWindow.open({ map });
      });
    } else {
      // 지원 안 되는 도시: 1km 반경 원 표시
      const center = { lat, lng };
      new google.maps.Circle({
        map,
        center,
        radius: 1000,
        strokeColor: "#1D4ED8",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: "#3B82F6",
        fillOpacity: 0.18,
      });
    }
  }, [city, areaGeoJson, lat, lng]);

  /* -----------------------------------------
     UI 렌더링
  ------------------------------------------ */
  const subtitle =
    city && city !== "Other"
      ? `${city}의 행정구역별 범죄 데이터를 기반으로 안전 구역을 시각화합니다.`
      : "현재 위치를 중심으로 1km 반경을 표시합니다. (지원되지 않는 도시)";

  return (
    <Card className="p-6 bg-white shadow">
      <h3 className="text-gray-900 mb-3">지역 안전 구역 지도</h3>
      <p className="text-gray-600 mb-4">{subtitle}</p>

      <div className="relative">
        <div ref={mapRef} className="w-full h-[450px] rounded-lg border" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
            <div className="text-gray-700 text-sm">
              범죄 데이터 불러오는 중...
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-x-4 bottom-4 bg-red-50 text-red-700 text-xs p-3 rounded-md shadow">
            {loadError}
          </div>
        )}

        {city && city !== "Other" && (
          <div className="absolute top-4 left-4 bg-white/90 p-3 rounded-lg shadow-lg">
            <div className="text-gray-700 font-medium mb-1">범례 (안전 점수)</div>
            {/* 기존 범례 그대로 */}
            <div className="space-y-1 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: "#006837" }}
                ></div>
                9–10 매우 안전
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: "#66BB6A" }}
                ></div>
                7–8 안전
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: "#FFEE58" }}
                ></div>
                5–6 보통
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: "#FFA726" }}
                ></div>
                3–4 주의
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: "#D32F2F" }}
                ></div>
                1–2 위험
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
