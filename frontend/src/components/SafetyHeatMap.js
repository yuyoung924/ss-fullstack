/* global google */
import { useEffect, useRef, useState } from "react";
import { Card } from "./ui/card";

export function SafetyHeatMap({ location, safetyScore, lat, lng , selectedFacilityType }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const [city, setCity] = useState(null);
  const [chicagoGeoJson, setChicagoGeoJson] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [facilityMarkers, setFacilityMarkers] = useState([]);

  /* -----------------------------------------
     1. 도시 자동 감지
  ------------------------------------------ */
  useEffect(() => {
    if (lat == null || lng == null) return;

    if (lat > 41 && lat < 42.5 && lng < -87 && lng > -88.5) {
      setCity("Chicago");
    } else if (lat > 37 && lat < 38 && lng > 126 && lng < 128) {
      setCity("Seoul");
    } else {
      setCity("Other");
    }
  }, [lat, lng]);

  /* -----------------------------------------
     2. 시카고일 경우 : 백엔드에서 영역별 안전도 GeoJSON 가져오기
        (GET /api/safety/chicago/areas)
  ------------------------------------------ */
  useEffect(() => {
    if (city !== "Chicago") return;

    async function fetchChicagoAreas() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const res = await fetch("http://localhost:4000/api/safety/chicago/areas");
        if (!res.ok) {
          throw new Error("시카고 안전도 데이터를 불러오지 못했습니다.");
        }
        const geojson = await res.json();
        setChicagoGeoJson(geojson);
      } catch (err) {
        console.error("Chicago safety API error:", err);
        setLoadError(err.message || "데이터 로딩 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchChicagoAreas();
  }, [city]);

  /* -----------------------------------------
     3. 구글맵 초기화
  ------------------------------------------ */
  useEffect(() => {
    if (!window.google || !mapRef.current || lat == null || lng == null) return;

    // 이미 생성된 맵이 있으면 center만 업데이트
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat, lng });
      return;
    }

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: city === "Chicago" ? 11 : 14,
    });

    // 현재 숙소 위치 마커
    new window.google.maps.Marker({
      map,
      position: { lat, lng },
    });

    mapInstanceRef.current = map;
  }, [lat, lng, city]);

  /* -----------------------------------------
     4. 시카고일 때: 폴리곤 색칠 (choropleth)
  ------------------------------------------ */
  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!google || !map) return;

    // 기존 DataLayer 비우기
    map.data.forEach((feature) => {
      map.data.remove(feature);
    });

    if (city === "Chicago" && chicagoGeoJson) {
      // GeoJSON 올리기
      map.data.addGeoJson(chicagoGeoJson);

      // 점수에 따라 색상 결정
      const getFillColor = (score) => {
        if (score >= 9) return "#006837"; // 매우 안전
        if (score >= 7) return "#66BB6A"; // 안전
        if (score >= 5) return "#FFEE58"; // 보통
        if (score >= 3) return "#FFA726"; // 주의
        return "#D32F2F";                // 위험
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

      // 클릭 시 정보창 (community 이름, 점수 등)
      const infoWindow = new google.maps.InfoWindow();
      map.data.addListener("click", (e) => {
        const props = e.feature.getProperty.bind(e.feature);
        const name = props("community");
        const score = props("safety_score");
        const crimes = props("crime_count");
        const position = e.latLng;

        const content = `
          <div style="font-size:13px;">
            <div style="font-weight:600; margin-bottom:4px;">${name}</div>
            <div>안전 점수: <b>${score}</b> / 10</div>
            <div>선택 기간 범죄 건수: <b>${crimes}</b>건</div>
          </div>
        `;

        infoWindow.setContent(content);
        infoWindow.setPosition(position);
        infoWindow.open({ map });
      });
    } else {
      // 시카고가 아닐 때: 1km 반경 원만 대체로 표시
      const center = { lat, lng };

      new google.maps.Circle({
        map,
        center,
        radius: 1000, // 1km
        strokeColor: "#1D4ED8",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: "#3B82F6",
        fillOpacity: 0.18,
      });
    }
  }, [city, chicagoGeoJson, lat, lng]);

  /* -----------------------------------------
     UI 렌더링
  ------------------------------------------ */
  const subtitle =
    city === "Chicago"
      ? "시카고 Community Area별 범죄 데이터를 기반으로 안전 구역을 시각화합니다."
      : "현재 위치를 중심으로 1km 반경을 표시합니다. (시카고 외 지역은 상세 범죄 데이터 미지원)";

  return (
    <Card className="p-6 bg-white shadow">
      <h3 className="text-gray-900 mb-3">지역 안전 구역 지도</h3>
      <p className="text-gray-600 mb-4">{subtitle}</p>

      <div className="relative">
        <div ref={mapRef} className="w-full h-[450px] rounded-lg border" />

        {/* 로딩 / 에러 표시 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
            <div className="text-gray-700 text-sm">시카고 범죄 데이터 불러오는 중...</div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-x-4 bottom-4 bg-red-50 text-red-700 text-xs p-3 rounded-md shadow">
            {loadError}
          </div>
        )}

        {/* 범례: 시카고일 때만 표시 */}
        {city === "Chicago" && (
          <div className="absolute top-4 left-4 bg-white/90 p-3 rounded-lg shadow-lg">
            <div className="text-gray-700 font-medium mb-1">범례 (안전 점수)</div>
            <div className="space-y-1 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "#006837" }}></div>
                9–10 매우 안전
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "#66BB6A" }}></div>
                7–8 안전
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "#FFEE58" }}></div>
                5–6 보통
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "#FFA726" }}></div>
                3–4 주의
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "#D32F2F" }}></div>
                1–2 위험
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}



