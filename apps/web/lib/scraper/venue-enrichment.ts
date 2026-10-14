
export type VenueData = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
};

/**
 * Enriquecer datos de venue usando Google Geocoding API.
 */
export async function enrichVenueWithGoogle(venueName: string): Promise<VenueData> {
  // ...implementación pendiente...
  return {
    id: '',
    name: venueName,
    address: '',
    latitude: null,
    longitude: null,
    google_maps_url: null,
  };
}
