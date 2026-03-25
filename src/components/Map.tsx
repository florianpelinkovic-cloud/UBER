import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, X } from 'lucide-react';

// Fix Leaflet marker icons
const DefaultIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  center: { lat: number; lng: number };
  markers?: { id: string; position: { lat: number; lng: number }; icon?: string; title?: string }[];
  route?: { lat: number; lng: number }[];
  onMapClick?: (e: L.LeafletMouseEvent) => void;
}

// Component to handle map centering and clicks
const MapEvents: React.FC<{ center: { lat: number; lng: number }; onMapClick?: (e: L.LeafletMouseEvent) => void }> = ({ center, onMapClick }) => {
  const map = useMap();
  
  useEffect(() => {
    const zoom = map.getZoom() || 13;
    map.setView([center.lat, center.lng], zoom);
  }, [center, map]);

  useEffect(() => {
    if (onMapClick) {
      map.on('click', onMapClick);
      return () => {
        map.off('click', onMapClick);
      };
    }
  }, [onMapClick, map]);

  return null;
};

const Map: React.FC<MapProps> = ({ center, markers = [], route = [], onMapClick }) => {
  // Use Mapify/Apify key if provided, otherwise fallback to standard OSM
  // Assuming VITE_MAPIFY_API_KEY or VITE_APIFY_API_KEY
  const apiKey = import.meta.env.VITE_MAPIFY_API_KEY || import.meta.env.VITE_APIFY_API_KEY;

  // Custom marker icons for Driver/Client
  const getIcon = (iconUrl?: string) => {
    if (!iconUrl) return DefaultIcon;
    return L.icon({
      iconUrl: iconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  };

  return (
    <div className="w-full h-full relative bg-neutral-900">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        
        <MapEvents center={center} onMapClick={onMapClick} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.position.lat, marker.position.lng]}
            icon={getIcon(marker.icon)}
          />
        ))}

        {route.length > 1 && (
          <Polyline
            positions={route.map(p => [p.lat, p.lng])}
            color="#3b82f6"
            weight={4}
            opacity={0.8}
          />
        )}
      </MapContainer>

      {/* Custom UI Overlays if needed */}
      {!apiKey && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
          <p className="text-[10px] text-white/50">Powered by OpenStreetMap</p>
        </div>
      )}
    </div>
  );
};

export default Map;
