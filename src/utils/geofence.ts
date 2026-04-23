/**
 * Haversine formula to calculate the great-circle distance between two GPS points.
 * Returns distance in meters.
 */
export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const isInsideGeoFence = (
  userLat: number,
  userLon: number,
  centerLat: number,
  centerLon: number,
  radiusMeters: number
): boolean => {
  const distance = haversineDistance(userLat, userLon, centerLat, centerLon);
  return distance <= radiusMeters;
};

export const GPS_ACCURACY_THRESHOLD = 50; // meters — attendance blocked if GPS accuracy > 50m

export const validateGpsAccuracy = (accuracyMeters: number): boolean => {
  return accuracyMeters <= GPS_ACCURACY_THRESHOLD;
};
