import React, { useEffect, useMemo, useState } from "react";
import { Chip } from "./ui";
import { cx } from "./format";

// The dashboard's map card: a list of countries on the left and a world map on
// the right, with each country shaded by the health of the PCs monitored there.
// `places` is [{ country, health }], where `country` is the English country
// name used by the world-atlas map data and `health` is 0 to 100.

const W = 240; // the map is drawn in this box and scaled to fit the card
const H = 228;
const SHADES = ["#1c7a2e", "#5cc061", "#b5dfbe"]; // best, next two, the rest
const LAND = "#e3e3e5";

// The map data and the projection code are only fetched when the card is shown.
let atlasPromise;
function loadAtlas() {
  if (!atlasPromise) {
    atlasPromise = Promise.all([
      import("d3-geo"),
      import("topojson-client"),
      import("world-atlas/countries-110m.json"),
    ]).then(([geo, topo, world]) => {
      const data = world.default || world;
      return { geo, countries: topo.feature(data, data.objects.countries).features };
    });
  }
  return atlasPromise;
}

const statusOf = (health) => (health >= 85 ? "Healthy" : health >= 70 ? "Fair" : "Needs attention");

export function DeviceMap({ places = [], emptyText, sample, onOpen }) {
  const [atlas, setAtlas] = useState(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadAtlas()
      .then((loaded) => { if (!cancelled) setAtlas(loaded); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Healthiest first; the shade follows the rank.
  const ranked = useMemo(() => (
    [...places]
      .sort((a, b) => (b.health ?? -1) - (a.health ?? -1))
      .map((p, i) => ({ ...p, colour: SHADES[i === 0 ? 0 : i < 3 ? 1 : 2] }))
  ), [places]);

  const drawn = useMemo(() => {
    if (!atlas) return null;
    const { geo, countries } = atlas;
    const byName = new Map(ranked.map((p) => [p.country, p]));
    const hit = countries.filter((f) => byName.has(f.properties.name));
    // Zoom to the countries that have devices; with none, show the whole world.
    const projection = hit.length
      ? geo.geoMercator().fitExtent([[30, 34], [W - 30, H - 34]], { type: "FeatureCollection", features: hit })
      : geo.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: "Sphere" });
    const path = geo.geoPath(projection);
    return {
      shapes: countries
        .map((f) => ({ key: f.id || f.properties.name, d: path(f), place: byName.get(f.properties.name) }))
        .filter((s) => s.d),
      pins: hit.map((f) => ({ place: byName.get(f.properties.name), at: path.centroid(f) })),
    };
  }, [atlas, ranked]);

  const current = ranked.find((p) => p.country === picked) || ranked[0];
  const pin = drawn?.pins.find((p) => p.place.country === current?.country);
  const tipWidth = current ? Math.max(76, current.country.length * 5.4 + 46) : 0;
  const tipX = pin ? (pin.at[0] + 9 + tipWidth > W ? pin.at[0] - 9 - tipWidth : pin.at[0] + 9) : 0;
  const tipY = pin ? Math.min(H - 30, Math.max(2, pin.at[1] - 14)) : 0;

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
                onClick={() => setPicked(p.country)}
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
        {failed && <span className="empty" style={{ height: "100%" }}>The map could not be loaded.</span>}
        {drawn && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={ranked.length ? `Map of ${ranked.map((p) => `${p.country} ${p.health}%`).join(", ")}` : "World map with no devices placed"}
          >
            {drawn.shapes.map((s) => (
              <path
                key={s.key}
                d={s.d}
                fill={s.place ? s.place.colour : LAND}
                stroke="#fff"
                strokeWidth="0.5"
                onMouseEnter={s.place ? () => setPicked(s.place.country) : undefined}
              />
            ))}
            {drawn.pins.map(({ place, at }) => (
              <g key={place.country} pointerEvents="none">
                <circle cx={at[0]} cy={at[1]} r={place.country === current?.country ? 7 : 5} fill={place.colour} opacity="0.3" />
                <circle cx={at[0]} cy={at[1]} r={place.country === current?.country ? 3.2 : 2.3} fill="#0e0e10" />
              </g>
            ))}
            {pin && (
              <g pointerEvents="none">
                <rect x={tipX} y={tipY} width={tipWidth} height="28" rx="6" fill="#0e0e10" />
                <text x={tipX + 8} y={tipY + 12} fill="#fff" fontSize="9.5" fontWeight="600">{current.country}</text>
                <text x={tipX + 8} y={tipY + 22} fill="#b9b9bf" fontSize="7.5">{statusOf(current.health)}</text>
                <text x={tipX + tipWidth - 8} y={tipY + 18} fill="#fff" fontSize="10" fontWeight="600" textAnchor="end">{current.health}%</text>
              </g>
            )}
          </svg>
        )}
      </div>

      <div className="row ac">
        <button type="button" className="vd" onClick={onOpen} aria-label="View details: devices">View details</button>
        {sample && <Chip tone="o">Sample data</Chip>}
      </div>
    </article>
  );
}
