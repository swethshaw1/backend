/**
 * Calculates the great-circle distance between two points on a sphere using the Haversine formula.
 * @returns Distance in meters.
 */
export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000;
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

/**
 * Determines if a given set of coordinates falls within a specified radius of a center point.
 */
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

/**
 * Maximum allowable GPS accuracy in meters. 
 * Requests with accuracy higher than this value are rejected.
 */
export const GPS_ACCURACY_THRESHOLD = 50;

/**
 * Validates whether the provided GPS accuracy is within the acceptable threshold.
 */
export const validateGpsAccuracy = (accuracyMeters: number): boolean => {
  return accuracyMeters <= GPS_ACCURACY_THRESHOLD;
};

