"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  DEFAULT_WEATHER_LOCATION,
  WEATHER_PRESETS,
  buildForecastUrl,
  buildGeocodingUrl,
  parseForecastResponse,
  parseGeocodingResponse,
  weatherDescriptor,
  windCompass,
  type WeatherLocation,
  type WeatherSnapshot,
} from "./weather-data";
import {
  flipDotGlyph,
  normalizeFlipDotText,
  weatherDotPattern,
  type DotPattern,
} from "./flip-dot-glyphs";

const LOCATION_STORAGE_KEY = "always-on-frame.weather-location.v1";
const WEATHER_CACHE_KEY = "always-on-frame.weather-cache.v1";
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_STALE_MS = 30 * 60 * 1000;

type DotCellStyle = CSSProperties & { "--flip-delay": string };
type LoadState = "idle" | "loading" | "ready" | "refreshing" | "stale" | "error";

interface CachedWeather {
  fetchedAt: number;
  locationId: string;
  snapshot: WeatherSnapshot;
}

function dotDelay(index: number, columns: number, groupIndex = 0) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  return (groupIndex * 17 + column * 10 + row * 4 + (index * 7) % 9) % 140;
}

const FlipDot = memo(function FlipDot({
  active,
  columns,
  groupIndex = 0,
  index,
}: {
  active: boolean;
  columns: number;
  groupIndex?: number;
  index: number;
}) {
  const style = {
    "--flip-delay": `${dotDelay(index, columns, groupIndex)}ms`,
  } as DotCellStyle;

  return (
    <i className="flip-dot" data-on={active ? "true" : "false"} style={style} aria-hidden="true">
      <span className="flip-dot__well">
        <span className="flip-dot__rotor">
          <span className="flip-dot__edge" />
          <span className="flip-dot__face flip-dot__face--off" />
          <span className="flip-dot__face flip-dot__face--on" />
        </span>
      </span>
    </i>
  );
});

function PatternDots({
  pattern,
  ready,
  groupIndex = 0,
}: {
  pattern: DotPattern;
  ready: boolean;
  groupIndex?: number;
}) {
  const columns = pattern[0]?.length ?? 1;
  return pattern.flatMap((row, rowIndex) =>
    [...row].map((cell, columnIndex) => {
      const index = rowIndex * columns + columnIndex;
      return (
        <FlipDot
          active={ready && cell === "1"}
          columns={columns}
          groupIndex={groupIndex}
          index={index}
          key={index}
        />
      );
    }),
  );
}

export function FlipDotText({
  className = "",
  label,
  ready,
  text,
}: {
  className?: string;
  label?: string;
  ready: boolean;
  text: string;
}) {
  const normalized = normalizeFlipDotText(text);
  return (
    <div
      className={`flip-dot-matrix ${className}`.trim()}
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {[...normalized].map((character, characterIndex) => (
        <span className="flip-dot-glyph" key={characterIndex}>
          <PatternDots
            pattern={flipDotGlyph(character)}
            ready={ready}
            groupIndex={characterIndex}
          />
        </span>
      ))}
    </div>
  );
}

function FlipDotWeatherIcon({
  icon,
  label,
  ready,
}: {
  icon: ReturnType<typeof weatherDescriptor>["icon"];
  label: string;
  ready: boolean;
}) {
  const pattern = weatherDotPattern(icon);
  return (
    <div
      className="flip-dot-weather-icon"
      style={{ "--matrix-columns": pattern[0]?.length ?? 9 } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <PatternDots pattern={pattern} ready={ready} groupIndex={4} />
    </div>
  );
}

function isWeatherLocation(value: unknown): value is WeatherLocation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WeatherLocation>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.admin === "string" &&
    typeof candidate.country === "string" &&
    typeof candidate.countryCode === "string" &&
    typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    Math.abs(candidate.latitude) <= 90 &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude) &&
    Math.abs(candidate.longitude) <= 180 &&
    typeof candidate.timezone === "string" &&
    candidate.timezone.length > 0
  );
}

function isCachedWeather(value: unknown): value is CachedWeather {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CachedWeather>;
  const snapshot = candidate.snapshot as Partial<WeatherSnapshot> | undefined;
  const units = snapshot?.units as Partial<WeatherSnapshot["units"]> | undefined;
  return (
    typeof candidate.fetchedAt === "number" &&
    Number.isFinite(candidate.fetchedAt) &&
    typeof candidate.locationId === "string" &&
    Boolean(snapshot) &&
    typeof snapshot?.observedAt === "string" &&
    typeof snapshot?.temperature === "number" &&
    typeof snapshot?.apparentTemperature === "number" &&
    typeof snapshot?.relativeHumidity === "number" &&
    typeof snapshot?.precipitation === "number" &&
    typeof snapshot?.weatherCode === "number" &&
    typeof snapshot?.isDay === "boolean" &&
    typeof snapshot?.windSpeed === "number" &&
    typeof snapshot?.windDirection === "number" &&
    typeof snapshot?.timezone === "string" &&
    typeof snapshot?.timezoneAbbreviation === "string" &&
    Boolean(units) &&
    typeof units?.temperature === "string" &&
    typeof units?.humidity === "string" &&
    typeof units?.precipitation === "string" &&
    typeof units?.windSpeed === "string"
  );
}

function readStoredJson(key: string) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) as unknown : null;
  } catch {
    return null;
  }
}

function storeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Device-local persistence is an enhancement; the display remains usable.
  }
}

function formatClock(date: Date | null, timezone: string) {
  if (!date) {
    return { date: "--- -- ---", hoursMinutes: "--:--", seconds: "--" };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "--";
    return {
      date: `${value("weekday")} ${value("day")} ${value("month")}`.toUpperCase(),
      hoursMinutes: `${value("hour")}:${value("minute")}`,
      seconds: value("second"),
    };
  } catch {
    return formatClock(date, "UTC");
  }
}

function compactLocation(location: WeatherLocation) {
  const region = location.admin && location.admin !== location.name
    ? location.admin
    : location.country;
  return [region, location.countryCode].filter(Boolean).join(" · ");
}

function rounded(value: number | null | undefined, fallback = "--") {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value))
    : fallback;
}

export function FlipDotClock({
  paused = false,
}: {
  paused?: boolean;
  shuffleSeed: string;
}) {
  const [location, setLocation] = useState<WeatherLocation>(DEFAULT_WEATHER_LOCATION);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const weatherRef = useRef<WeatherSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const fetchedAtRef = useRef(0);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [statusMessage, setStatusMessage] = useState("Loading current conditions");
  const [now, setNow] = useState<Date | null>(null);
  const [dotsReady, setDotsReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "empty" | "error">("idle");
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const locationButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => setDotsReady(true));
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches);
    updateMotionPreference();
    if (typeof motionPreference.addEventListener === "function") {
      motionPreference.addEventListener("change", updateMotionPreference);
    } else {
      motionPreference.addListener(updateMotionPreference);
    }
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (typeof motionPreference.removeEventListener === "function") {
        motionPreference.removeEventListener("change", updateMotionPreference);
      } else {
        motionPreference.removeListener(updateMotionPreference);
      }
    };
  }, []);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const storedLocation = readStoredJson(LOCATION_STORAGE_KEY);
      const nextLocation = isWeatherLocation(storedLocation)
        ? storedLocation
        : DEFAULT_WEATHER_LOCATION;
      setLocation(nextLocation);
      const storedWeather = readStoredJson(WEATHER_CACHE_KEY);
      if (isCachedWeather(storedWeather) && storedWeather.locationId === nextLocation.id) {
        weatherRef.current = storedWeather.snapshot;
        fetchedAtRef.current = storedWeather.fetchedAt;
        setWeather(storedWeather.snapshot);
        setFetchedAt(storedWeather.fetchedAt);
        const stale = Date.now() - storedWeather.fetchedAt > WEATHER_STALE_MS;
        setLoadState(stale ? "stale" : "ready");
        setStatusMessage(stale ? "Showing saved conditions while refreshing" : "Current conditions loaded");
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (paused) return;
    let timer = 0;
    const update = () => {
      setNow(new Date());
      timer = window.setTimeout(update, 1000 - (Date.now() % 1000) + 12);
    };
    update();
    return () => window.clearTimeout(timer);
  }, [paused]);

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  useEffect(() => {
    fetchedAtRef.current = fetchedAt;
  }, [fetchedAt]);

  useEffect(() => {
    if (!preferencesReady || paused) return;
    const controller = new AbortController();
    let refreshTimer = 0;
    let requestRunning = false;

    const refresh = async () => {
      if (requestRunning || controller.signal.aborted) return;
      requestRunning = true;
      setLoadState(weatherRef.current ? "refreshing" : "loading");
      setStatusMessage(weatherRef.current ? "Refreshing current conditions" : "Loading current conditions");
      try {
        const response = await fetch(buildForecastUrl(location), {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
        const snapshot = parseForecastResponse(await response.json());
        if (!snapshot) throw new Error("Weather response was incomplete");
        const nextFetchedAt = Date.now();
        weatherRef.current = snapshot;
        fetchedAtRef.current = nextFetchedAt;
        setWeather(snapshot);
        setFetchedAt(nextFetchedAt);
        setLoadState("ready");
        setStatusMessage(`Current conditions loaded for ${location.name}`);
        storeJson(WEATHER_CACHE_KEY, {
          fetchedAt: nextFetchedAt,
          locationId: location.id,
          snapshot,
        } satisfies CachedWeather);
      } catch {
        if (controller.signal.aborted) return;
        const hasSavedWeather = Boolean(weatherRef.current);
        setLoadState(hasSavedWeather ? "stale" : "error");
        setStatusMessage(
          hasSavedWeather
            ? "Live weather is unavailable; showing the last saved conditions"
            : "Current weather is temporarily unavailable",
        );
      } finally {
        requestRunning = false;
      }
    };

    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - fetchedAtRef.current >= WEATHER_REFRESH_MS
      ) {
        void refresh();
      }
    };

    void refresh();
    refreshTimer = window.setInterval(() => void refresh(), WEATHER_REFRESH_MS);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [location, paused, preferencesReady]);

  useEffect(() => {
    if (!pickerOpen) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(focusTimer);
  }, [pickerOpen]);

  useEffect(() => () => searchControllerRef.current?.abort(), []);

  const runLocationSearch = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
      setResults([]);
      setSearchState("empty");
      return;
    }
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearchState("searching");
    try {
      const response = await fetch(buildGeocodingUrl(normalizedQuery), {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Location request failed: ${response.status}`);
      const nextResults = parseGeocodingResponse(await response.json());
      setResults(nextResults);
      setSearchState(nextResults.length ? "idle" : "empty");
    } catch {
      if (controller.signal.aborted) return;
      setResults([]);
      setSearchState("error");
    }
  }, [query]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    window.requestAnimationFrame(() => locationButtonRef.current?.focus());
  }, []);

  const chooseLocation = useCallback((nextLocation: WeatherLocation) => {
    searchControllerRef.current?.abort();
    storeJson(LOCATION_STORAGE_KEY, nextLocation);
    setLocation(nextLocation);
    weatherRef.current = null;
    fetchedAtRef.current = 0;
    setWeather(null);
    setFetchedAt(0);
    setLoadState("loading");
    setStatusMessage(`Loading current conditions for ${nextLocation.name}`);
    setPickerOpen(false);
    window.requestAnimationFrame(() => locationButtonRef.current?.focus());
    setQuery("");
    setResults([]);
    setSearchState("idle");
  }, []);

  const timezone = weather?.timezone || location.timezone;
  const clock = useMemo(() => formatClock(now, timezone), [now, timezone]);
  const descriptor = weather
    ? weatherDescriptor(weather.weatherCode, weather.isDay)
    : { label: "Weather unavailable", icon: "unknown" as const };
  const colonVisible = reducedMotion || !now || now.getSeconds() % 2 === 0;
  const clockText = colonVisible
    ? clock.hoursMinutes
    : clock.hoursMinutes.replace(":", " ");
  const temperatureText = weather
    ? `${rounded(weather.temperature).padStart(3, " ")}°`
    : " --°";
  const stale = loadState === "stale" || (
    fetchedAt > 0 &&
    now !== null &&
    now.getTime() - fetchedAt > WEATHER_STALE_MS
  );

  return (
    <section className="flip-clock-mode" aria-label={`Flip-dot clock and weather for ${location.name}`}>
      <div className="flip-clock-cabinet">
        {(["nw", "ne", "sw", "se"] as const).map((position) => (
          <span className={`flip-clock-screw flip-clock-screw--${position}`} key={position} aria-hidden="true" />
        ))}

        <header className="flip-clock-header">
          <div className="flip-clock-maker">
            <span>FDP–01</span>
            <strong>MECHANICAL TIME / WEATHER</strong>
          </div>
          <button
            ref={locationButtonRef}
            className="flip-clock-location-button"
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="flip-clock-location-marker" aria-hidden="true" />
            <span>
              <strong>{location.name}</strong>
              <small>{compactLocation(location)}</small>
            </span>
            <span aria-hidden="true">CHANGE</span>
          </button>
        </header>

        <div className="flip-clock-board">
          <section className="flip-clock-time-zone" aria-label="Local time">
            <div className="flip-clock-section-label">
              <span>LOCAL TIME</span>
              <span>{weather?.timezoneAbbreviation || timezone}</span>
            </div>
            <div className="flip-clock-time-row">
              <FlipDotText
                className="flip-dot-matrix--time"
                label={`${clock.hoursMinutes}, ${clock.date}, ${location.name}`}
                ready={dotsReady}
                text={clockText}
              />
              <div className="flip-clock-seconds-board">
                <span>SEC</span>
                <FlipDotText
                  className="flip-dot-matrix--seconds"
                  label={`${clock.seconds} seconds`}
                  ready={dotsReady}
                  text={clock.seconds}
                />
              </div>
            </div>
            <div className="flip-clock-date-line">
              <time dateTime={now?.toISOString()}>{clock.date}</time>
              <span>24 HOUR / LOCAL ZONE</span>
            </div>
          </section>

          <section className="flip-clock-weather-zone" aria-label="Current weather">
            <div className="flip-clock-section-label">
              <span>CURRENT CONDITIONS</span>
              <span className={`flip-clock-sync flip-clock-sync--${loadState}`}>
                {loadState === "loading" || loadState === "refreshing"
                  ? "SYNC"
                  : stale
                    ? "SAVED"
                    : loadState === "error"
                      ? "OFFLINE"
                      : "LIVE"}
              </span>
            </div>
            <div className="flip-clock-weather-main">
              <FlipDotWeatherIcon icon={descriptor.icon} label={descriptor.label} ready={dotsReady} />
              <div className="flip-clock-temperature">
                <FlipDotText
                  className="flip-dot-matrix--temperature"
                  label={weather ? `${Math.round(weather.temperature)} degrees Celsius` : "Temperature unavailable"}
                  ready={dotsReady}
                  text={temperatureText}
                />
                <div>
                  <strong>{descriptor.label}</strong>
                  <span>CELSIUS</span>
                </div>
              </div>
            </div>

            <dl className="flip-clock-weather-stats">
              <div>
                <dt>FEELS</dt>
                <dd>{weather ? `${rounded(weather.apparentTemperature)}${weather.units.temperature}` : "--"}</dd>
              </div>
              <div>
                <dt>HIGH / LOW</dt>
                <dd>{weather ? `${rounded(weather.temperatureMax)}° / ${rounded(weather.temperatureMin)}°` : "-- / --"}</dd>
              </div>
              <div>
                <dt>HUMIDITY</dt>
                <dd>{weather ? `${rounded(weather.relativeHumidity)}${weather.units.humidity}` : "--"}</dd>
              </div>
              <div>
                <dt>WIND</dt>
                <dd>{weather ? `${windCompass(weather.windDirection)} ${rounded(weather.windSpeed)} ${weather.units.windSpeed}` : "--"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="flip-clock-footer">
          <span aria-live="polite" aria-atomic="true">{statusMessage}</span>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Weather data by Open–Meteo
          </a>
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            Location data by GeoNames
          </a>
        </footer>
      </div>

      {pickerOpen && (
        <div
          className="flip-clock-picker-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closePicker();
          }}
        >
          <section
            ref={pickerRef}
            className="flip-clock-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="flip-clock-picker-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closePicker();
                return;
              }
              if (event.key !== "Tab") return;
              const focusable = pickerRef.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
              );
              if (!focusable?.length) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <header>
              <div>
                <span>WEATHER STATION</span>
                <h2 id="flip-clock-picker-title">Choose a location</h2>
              </div>
              <button type="button" onClick={closePicker} aria-label="Close location picker">
                ×
              </button>
            </header>

            <form onSubmit={runLocationSearch} className="flip-clock-search" role="search">
              <label htmlFor="flip-clock-location-search">CITY OR POSTCODE</label>
              <div>
                <input
                  ref={searchInputRef}
                  id="flip-clock-location-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search anywhere"
                  autoComplete="off"
                  aria-describedby="flip-clock-search-status"
                />
                <button type="submit">SEARCH</button>
              </div>
            </form>

            <div id="flip-clock-search-status" className="flip-clock-search-status" aria-live="polite">
              {searchState === "searching" && "Searching locations…"}
              {searchState === "empty" && (query.trim().length < 3 ? "Enter at least three characters." : "No matching locations found.")}
              {searchState === "error" && "Location search is temporarily unavailable."}
            </div>

            {results.length > 0 ? (
              <ul className="flip-clock-location-results" aria-label="Location search results">
                {results.map((result) => (
                  <li key={result.id}>
                    <button type="button" onClick={() => chooseLocation(result)}>
                      <span>
                        <strong>{result.name}</strong>
                        <small>{[result.admin, result.country].filter(Boolean).join(", ")}</small>
                      </span>
                      <span>{result.countryCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flip-clock-presets">
                <span>QUICK SELECT</span>
                <div>
                  {WEATHER_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className={preset.id === location.id ? "is-current" : ""}
                      onClick={() => chooseLocation(preset)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
