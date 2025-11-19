import React, { useEffect, useRef } from "react";

function MapComponent({ lat, lng, heatmapData }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const heatmapRef = useRef(null);

  // 지도 생성
  useEffect(() => {
    if (window.google && mapRef.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: { lat, lng },
        zoom: 14,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
      });
    }
  }, [lat, lng]);

  // 히트맵 Layer 생성
  useEffect(() => {
  if (window.google && mapInstance.current && heatmapData && heatmapData.length > 0) {

    const gradient = [
      "rgba(0, 255, 0, 0)",
      "rgba(0, 255, 0, 1)",
      "rgba(255, 255, 0, 1)",
      "rgba(255, 165, 0, 1)",
      "rgba(255, 69, 0, 1)",
      "rgba(255, 0, 0, 1)"
    ];

    const heatmap = new window.google.maps.visualization.HeatmapLayer({
      data: heatmapData.map(p => new window.google.maps.LatLng(p.lat, p.lng)),
      radius: 35,
      gradient: gradient   // 🔥 여기!
    });

    heatmap.setMap(mapInstance.current);
  }
}, [heatmapData]);


  return (
    <div
      ref={mapRef}
      className="map-container"
      style={{
        width: "100%",
        height: "500px",
        borderRadius: "10px",
      }}
    />
  );
}

export default MapComponent;
