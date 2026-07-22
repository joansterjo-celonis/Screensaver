export type WeatherIconName =
  | "clear-day"
  | "clear-night"
  | "partly-cloudy-day"
  | "partly-cloudy-night"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm"
  | "unknown";

export interface WeatherLocation {
  id: string;
  name: string;
  admin: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface WeatherSnapshot {
  observedAt: string;
  timezone: string;
  timezoneAbbreviation: string;
  temperature: number;
  apparentTemperature: number;
  relativeHumidity: number;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
  windSpeed: number;
  windDirection: number;
  temperatureMax: number | null;
  temperatureMin: number | null;
  units: {
    temperature: string;
    humidity: string;
    precipitation: string;
    windSpeed: string;
  };
}

export interface WeatherDescriptor {
  label: string;
  icon: WeatherIconName;
}

export const DEFAULT_WEATHER_LOCATION: WeatherLocation = Object.freeze({
  id: "2950159",
  name: "Berlin",
  admin: "Berlin",
  country: "Germany",
  countryCode: "DE",
  latitude: 52.52437,
  longitude: 13.41053,
  timezone: "Europe/Berlin",
});

export const WEATHER_PRESETS: readonly WeatherLocation[] = Object.freeze([
  DEFAULT_WEATHER_LOCATION,
  {
    id: "2643743",
    name: "London",
    admin: "England",
    country: "United Kingdom",
    countryCode: "GB",
    latitude: 51.50853,
    longitude: -0.12574,
    timezone: "Europe/London",
  },
  {
    id: "5128581",
    name: "New York",
    admin: "New York",
    country: "United States",
    countryCode: "US",
    latitude: 40.71427,
    longitude: -74.00597,
    timezone: "America/New_York",
  },
  {
    id: "1850147",
    name: "Tokyo",
    admin: "Tokyo",
    country: "Japan",
    countryCode: "JP",
    latitude: 35.6895,
    longitude: 139.69171,
    timezone: "Asia/Tokyo",
  },
  {
    id: "2147714",
    name: "Sydney",
    admin: "New South Wales",
    country: "Australia",
    countryCode: "AU",
    latitude: -33.86785,
    longitude: 151.20732,
    timezone: "Australia/Sydney",
  },
]);

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
] as const;

export function buildForecastUrl(location: WeatherLocation) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("current", CURRENT_FIELDS.join(","));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");
  return url.toString();
}

export function buildGeocodingUrl(query: string, count = 6) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query.trim());
  url.searchParams.set("count", String(Math.max(1, Math.min(10, Math.floor(count)))));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteDailyValue(value: unknown) {
  if (!Array.isArray(value)) return null;
  return finiteNumber(value[0]);
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function parseGeocodingResponse(payload: unknown): WeatherLocation[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];

  return payload.results.flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const latitude = finiteNumber(candidate.latitude);
    const longitude = finiteNumber(candidate.longitude);
    const name = textValue(candidate.name);
    const timezone = textValue(candidate.timezone);
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      !name ||
      !timezone
    ) {
      return [];
    }

    return [{
      id: String(candidate.id ?? `${latitude}:${longitude}:${index}`),
      name,
      admin: textValue(candidate.admin1),
      country: textValue(candidate.country, textValue(candidate.country_code)),
      countryCode: textValue(candidate.country_code),
      latitude,
      longitude,
      timezone,
    }];
  });
}

export function parseForecastResponse(payload: unknown): WeatherSnapshot | null {
  if (!isRecord(payload) || !isRecord(payload.current)) return null;
  const current = payload.current;
  const currentUnits = isRecord(payload.current_units) ? payload.current_units : {};
  const daily = isRecord(payload.daily) ? payload.daily : {};
  const temperature = finiteNumber(current.temperature_2m);
  const apparentTemperature = finiteNumber(current.apparent_temperature);
  const relativeHumidity = finiteNumber(current.relative_humidity_2m);
  const precipitation = finiteNumber(current.precipitation);
  const weatherCode = finiteNumber(current.weather_code);
  const isDay = finiteNumber(current.is_day);
  const windSpeed = finiteNumber(current.wind_speed_10m);
  const windDirection = finiteNumber(current.wind_direction_10m);
  const timezone = textValue(payload.timezone);

  if (
    temperature === null ||
    apparentTemperature === null ||
    relativeHumidity === null ||
    precipitation === null ||
    weatherCode === null ||
    isDay === null ||
    windSpeed === null ||
    windDirection === null ||
    !timezone
  ) {
    return null;
  }

  return {
    observedAt: textValue(current.time),
    timezone,
    timezoneAbbreviation: textValue(payload.timezone_abbreviation),
    temperature,
    apparentTemperature,
    relativeHumidity,
    precipitation,
    weatherCode: Math.round(weatherCode),
    isDay: isDay > 0,
    windSpeed,
    windDirection,
    temperatureMax: finiteDailyValue(daily.temperature_2m_max),
    temperatureMin: finiteDailyValue(daily.temperature_2m_min),
    units: {
      temperature: textValue(currentUnits.temperature_2m, "°C"),
      humidity: textValue(currentUnits.relative_humidity_2m, "%"),
      precipitation: textValue(currentUnits.precipitation, "mm"),
      windSpeed: textValue(currentUnits.wind_speed_10m, "km/h"),
    },
  };
}

export function weatherDescriptor(code: number, isDay: boolean): WeatherDescriptor {
  if (code === 0) {
    return { label: isDay ? "Clear" : "Clear night", icon: isDay ? "clear-day" : "clear-night" };
  }
  if (code === 1 || code === 2) {
    return {
      label: code === 1 ? "Mainly clear" : "Partly cloudy",
      icon: isDay ? "partly-cloudy-day" : "partly-cloudy-night",
    };
  }
  if (code === 3) return { label: "Overcast", icon: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Drizzle", icon: "drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Rain", icon: "rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snow", icon: "snow" };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Conditions unavailable", icon: "unknown" };
}

export function windCompass(degrees: number) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = ((degrees % 360) + 360) % 360;
  return points[Math.round(normalized / 45) % points.length];
}
