"""
Roughly where a PC is, from its internet address, when Windows Location
can't say (switched off on the PC, or no Wi-Fi to locate by).

Looked up in DB-IP's free "IP to City Lite" database, which is downloaded
into the API image when it is built (Dockerfile), so no outside service ever
sees a PC's address. It is city-level at best, and wrong behind a VPN or a
mobile network's gateway, so the dashboard always shows it as approximate.
Licence: CC BY 4.0, "IP geolocation by DB-IP" (https://db-ip.com), credited
wherever an estimate is shown.
"""

import ipaddress
import logging
import os
import threading
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings
from app.core.countries import canonical_country

logger = logging.getLogger(__name__)

# How far off a city-level estimate typically is; shown as the accuracy.
APPROXIMATE_M = 25_000.0

_lock = threading.Lock()
_reader = None
_tried = False


@dataclass(frozen=True)
class IPPlace:
    latitude: float
    longitude: float
    city: Optional[str]
    country: Optional[str]  # as the dashboard map spells it, when it has the country


def _open():
    global _reader, _tried
    with _lock:
        if _tried:
            return _reader
        _tried = True
        path = settings.IP_LOCATION_DB
        if not path or not os.path.exists(path):
            logger.info("No IP location database at %s; PCs without Windows Location show their country only", path)
            return None
        try:
            import maxminddb
            _reader = maxminddb.open_database(path, maxminddb.MODE_MMAP)
            logger.info("IP location database loaded: %s (%s)", path, _reader.metadata().database_type)
        except Exception:
            logger.exception("Couldn't open the IP location database at %s", path)
            _reader = None
        return _reader


# DB-IP's English names where the map spells the country differently.
_MAP_NAMES = {
    "United States": "United States of America",
    "DR Congo": "Dem. Rep. Congo",
    "Democratic Republic of the Congo": "Dem. Rep. Congo",
    "Republic of the Congo": "Congo",
    "Central African Republic": "Central African Rep.",
    "South Sudan": "S. Sudan",
    "Bosnia and Herzegovina": "Bosnia and Herz.",
    "Dominican Republic": "Dominican Rep.",
    "Equatorial Guinea": "Eq. Guinea",
    "Eswatini": "eSwatini",
    "Swaziland": "eSwatini",
    "Solomon Islands": "Solomon Is.",
    "Western Sahara": "W. Sahara",
    "Ivory Coast": "Côte d'Ivoire",
    "Czech Republic": "Czechia",
    "Republic of Korea": "South Korea",
    "Viet Nam": "Vietnam",
}


def map_country(name: Optional[str]) -> Optional[str]:
    """The map's spelling of a country, or None if the map doesn't have it."""
    if not name:
        return None
    try:
        return canonical_country(_MAP_NAMES.get(name, name))
    except ValueError:
        return None


def _name(record: dict, key: str) -> Optional[str]:
    names = (record.get(key) or {}).get("names") or {}
    return names.get("en")


def lookup(address: Optional[str]) -> Optional[IPPlace]:
    """The place for a public internet address, or None (private address,
    unknown to the database, or no database)."""
    try:
        ip = ipaddress.ip_address((address or "").strip())
    except ValueError:
        return None
    if not ip.is_global:
        return None  # a home or office network's own address says nothing
    reader = _open()
    if reader is None:
        return None
    try:
        record = reader.get(str(ip)) or {}
    except Exception:
        logger.exception("IP location lookup failed")
        return None
    loc = record.get("location") or {}
    lat, lon = loc.get("latitude"), loc.get("longitude")
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return IPPlace(
        latitude=float(lat), longitude=float(lon), city=_name(record, "city"),
        country=map_country(_name(record, "country")),
    )


def reset_for_tests() -> None:
    global _reader, _tried
    with _lock:
        _reader, _tried = None, False
