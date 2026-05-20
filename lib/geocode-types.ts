export type GeocodeProvider = "google";

export type GeocodeResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  provider: GeocodeProvider;
};

export type PlaceSuggestion = {
  placeId: string;
  description: string;
  latitude: number;
  longitude: number;
  provider: GeocodeProvider;
};
