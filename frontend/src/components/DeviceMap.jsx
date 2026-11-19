import React, { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "./format";

// The dashboard's map card: a list of countries on the left and a live map on
// the right that pans and zooms like Google Maps, from the whole world down to
// streets. Countries with PCs are shaded by the health of the PCs there; the
// shading fades as you zoom in so the real map shows through.
// `places` is [{ country, health }], where `country` is the English country
// name used by the world-atlas data and `health` is 0 to 100.
//
// The base map comes from OpenFreeMap (free, no key): the browser fetches its
// tiles from tiles.openfreemap.org.

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const SHADES = ["#1c7a2e", "#5cc061", "#b5dfbe"]; // best, next two, the rest
const LAND = "#e3e3e5";
const SEA = "#ffffff";
const WORLD_VIEW = { center: [15, 20], zoom: 0.4 };

// MapLibre, its styles and the country outlines load only when the card is shown.
let libsPromise;
function loadLibs() {
  if (!libsPromise) {
    libsPromise = Promise.all([
      import("maplibre-gl"),
      // MapLibre looks for its worker next to its own file, which Vite moves.
      // "?worker&url" has Vite build the worker and hand back where it lives.
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
      import("d3-geo"),
      import("topojson-client"),
      import("world-atlas/countries-110m.json"),
    ]).then(([maplibre, worker, , geo, topo, world]) => {
      const maplibregl = maplibre.default || maplibre;
      maplibregl.setWorkerUrl(worker.default);
      const data = world.default || world;
      return {
        maplibregl,
        geo,
        countries: topo.feature(data, data.objects.countries).features,
      };
    });
  }
  return libsPromise;
}

const statusOf = (health) => (health >= 85 ? "Healthy" : health >= 70 ? "Fair" : "Needs attention");

/** Where to put a country's pin: the middle of its largest landmass. */
function pinFor(geo, feature) {
  if (feature.geometry.type !== "MultiPolygon") return geo.geoCentroid(feature);
  const parts = feature.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
  const largest = parts.reduce((best, part) => (geo.geoArea(part) > geo.geoArea(best) ? part : best));
  return geo.geoCentroid(largest);
}

/** The map's own colours, changed to the card's grey land and white sea. */
function restyle(map) {
  const set = (layer, prop, value) => { if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value); };
  set("background", "background-color", LAND);
  set("water", "fill-color", SEA);
  set("boundary_2", "line-color", "#ffffff");
  set("boundary_2", "line-opacity", 1);
  set("boundary_3", "line-color", "#ffffff");
  set("boundary_disputed", "line-color", "#ffffff");
}

function pinElement(colour, onEnter) {
  const el = document.createElement("div");
  el.className = "map-pin";
  el.style.setProperty("--pin", colour);
  el.addEventListener("mouseenter", onEnter);
  return el;
}

function tipElement() {
  const el = document.createElement("div");
  el.className = "map-tip";
  el.innerHTML = "<span><b></b><small></small></span><em></em>";
  return el;
}

export function DeviceMap({ places = [], emptyText, onOpen }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const pinsRef = useRef([]);
  const tipRef = useRef(null);
  const [libs, setLibs] = useState(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState(null);
  // Bumped by "Reload map", which builds the map again after the graphics card dropped it.
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLibs()
      .then((loaded) => { if (!cancelled) setLibs(loaded); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Healthiest first; the shade follows the rank.
  const ranked = useMemo(() => (
    [...places]
      .sort((a, b) => (b.health ?? -1) - (a.health ?? -1))
      .map((p, i) => ({ ...p, colour: SHADES[i === 0 ? 0 : i < 3 ? 1 : 2] }))
  ), [places]);

  // Each placed country's outline, pin position and bounds.
  const placed = useMemo(() => {
    if (!libs) return [];
    const byName = new Map(libs.countries.map((f) => [f.properties.name, f]));
    return ranked
      .filter((p) => byName.has(p.country))
      .map((p) => {
        const feature = byName.get(p.country);
        return { ...p, feature, pin: pinFor(libs.geo, feature), bounds: libs.geo.geoBounds(feature) };
      });
  }, [libs, ranked]);

  const fitAll = useMemo(() => () => {
    const map = mapRef.current;
    if (!map || !libs) return;
    if (!placed.length) {
      map.jumpTo(WORLD_VIEW);
      return;
    }
    const bounds = libs.geo.geoBounds({ type: "FeatureCollection", features: placed.map((p) => p.feature) });
    map.fitBounds(bounds, { padding: 36, maxZoom: 4, duration: 600 });
  }, [libs, placed]);

  // Create the map once the library is in.
  useEffect(() => {
    if (!libs || !boxRef.current) return undefined;
    const { maplibregl } = libs;
    let map;
    try {
      map = new maplibregl.Map({
        container: boxRef.current,
        style: STYLE_URL,
        ...WORLD_VIEW,
        minZoom: 0,
        maxZoom: 18,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // "style.load" rather than "load": "load" waits for every tile to be drawn,
    // which never happens while the browser tab is in the background.
    let loaded = false;
    map.once("style.load", () => {
      loaded = true;
      restyle(map);
      // Shaded countries sit under the base map's labels so names stay readable.
      const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      map.addSource("lectio-places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "lectio-places-fill",
        type: "fill",
        source: "lectio-places",
        paint: {
          "fill-color": ["get", "shade"],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.95, 3, 0.85, 5, 0.35, 6.5, 0],
        },
      }, firstLabel);
      map.on("mousemove", "lectio-places-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const name = e.features?.[0]?.properties?.country;
        if (name) setPicked(name);
      });
      map.on("mouseleave", "lectio-places-fill", () => { map.getCanvas().style.cursor = ""; });
      setReady(true);
    });
    // A failed style means no map at all; failed tiles are left to retry.
    map.on("error", () => { if (!loaded) setFailed(true); });
    // The browser can take the graphics context away (low memory, sleep); offer a reload.
    map.on("webglcontextlost", () => setLost(true));

    // Keep the map sized to its box when the layout changes.
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(boxRef.current);

    return () => {
      resize.disconnect();
      pinsRef.current.forEach((m) => m.remove());
      pinsRef.current = [];
      tipRef.current?.remove();
      tipRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [libs, attempt]);

  // Shading and pins follow the list of places as it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource("lectio-places")?.setData({
      type: "FeatureCollection",
      features: placed.map((p) => ({ ...p.feature, properties: { country: p.country, shade: p.colour } })),
    });
    pinsRef.current.forEach((m) => m.remove());
    pinsRef.current = placed.map((p) => new libs.maplibregl.Marker({ element: pinElement(p.colour, () => setPicked(p.country)) })
      .setLngLat(p.pin)
      .addTo(map));
    fitAll();
  }, [ready, placed, libs, fitAll]);

  const current = ranked.find((p) => p.country === picked) || ranked[0];
  const currentPin = placed.find((p) => p.country === current?.country);

  // The dark tooltip beside the chosen country's pin, on whichever side has room.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return undefined;
    if (!currentPin) {
      tipRef.current?.remove();
      tipRef.current = null;
      return undefined;
    }
    if (!tipRef.current) {
      tipRef.current = new libs.maplibregl.Marker({ element: tipElement(), anchor: "left", offset: [12, 0] });
    }
    const el = tipRef.current.getElement();
    el.querySelector("b").textContent = currentPin.country;
    el.querySelector("small").textContent = statusOf(currentPin.health);
    el.querySelector("em").textContent = currentPin.health === null || currentPin.health === undefined ? "—" : `${currentPin.health}%`;
    tipRef.current.setLngLat(currentPin.pin).addTo(map);
    pinsRef.current.forEach((m, i) => m.getElement().classList.toggle("on", placed[i]?.country === currentPin.country));
    const tip = tipRef.current;
    const side = () => {
      const x = map.project(currentPin.pin).x;
      const width = tip.getElement().offsetWidth;
      tip.setOffset(x + 12 + width > map.getContainer().clientWidth - 6 ? [-(12 + width), 0] : [12, 0]);
    };
    side();
    map.on("move", side);
    return () => map.off("move", side);
  }, [ready, currentPin, placed, libs]);

  const flyTo = (place) => {
    setPicked(place.country);
    const target = placed.find((p) => p.country === place.country);
    if (mapRef.current && target) mapRef.current.fitBounds(target.bounds, { padding: 30, maxZoom: 5, duration: 900 });
  };

  return (
    <article className="card mapcard">
      <h3>Devices by Country</h3>
      <p>Countries shaded by the share of each PC's readings that are within their limits.</p>

      {ranked.length > 0 ? (
        <ul className="places">
          {ranked.map((p) => (
            <li key={p.country}>
              <button
                type="button"
                className={cx(p.country === current?.country && "on")}
                onMouseEnter={() => setPicked(p.country)}
                onFocus={() => setPicked(p.country)}
                onClick={() => flyTo(p)}
                aria-label={`${p.country}, ${p.health ?? "no"}% health. Zoom the map to it.`}
              >
                <i style={{ background: p.colour }} aria-hidden="true" />
                {p.country}
                <em>{p.health === null || p.health === undefined ? "—" : `${p.health}%`}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ marginBottom: "calc(6 * var(--u))" }}>{emptyText}</p>
      )}

      <div className="geo">
        <div
          ref={boxRef}
          className="geo-map"
          role="region"
          aria-label="Map of your devices. Drag to move, scroll or use the plus and minus buttons to zoom."
        />
        {ready && (
          <button type="button" className="map-reset" onClick={fitAll} title="Zoom out to show every country">Show all</button>
        )}
        {lost && !failed && (
          <span className="empty geo-note geo-lost">
            The map stopped drawing.
            <button type="button" className="vd" onClick={() => { setLost(false); setAttempt((n) => n + 1); }}>Reload map</button>
          </span>
        )}
        {failed && <span className="empty geo-note">The map could not be loaded. Check your connection.</span>}
        {!failed && !ready && <span className="empty geo-note">Loading map…</span>}
      </div>

      <div className="row ac">
        <button type="button" className="vd" onClick={onOpen} aria-label="View details: devices">View details</button>
      </div>
    </article>
  );
}
