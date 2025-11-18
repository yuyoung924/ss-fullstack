/* global google */
import { useEffect } from "react";

function MapComponent({ lat, lng }) {
  useEffect(() => {
    const map = new google.maps.Map(document.getElementById("map"), {
      center: { lat, lng },
      zoom: 15,
    });

    new google.maps.Marker({
      position: { lat, lng },
      map: map,
    });
  }, [lat, lng]);

  return <div id="map" style={{ width: "500px", height: "400px" }}></div>;
}

export default MapComponent;
