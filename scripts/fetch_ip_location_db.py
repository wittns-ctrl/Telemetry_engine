"""Download DB-IP's free "IP to City Lite" database (CC BY 4.0, https://db-ip.com).

Used by the Dockerfile at build time: the API looks up a PC's internet address
locally, so no outside service sees it (app/services/ip_location.py). Tries
this month's file, then last month's (a new one appears early each month).
A failure leaves no file and exits 0: the API then simply has no estimates.

    python scripts/fetch_ip_location_db.py data/dbip-city-lite.mmdb
"""

import gzip
import shutil
import sys
import urllib.request
from datetime import date
from pathlib import Path

URL = "https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz"


def months():
    today = date.today()
    yield today.strftime("%Y-%m")
    prev = date(today.year - (today.month == 1), (today.month - 2) % 12 + 1, 1)
    yield prev.strftime("%Y-%m")


def main(target: str) -> int:
    out = Path(target)
    out.parent.mkdir(parents=True, exist_ok=True)
    for month in months():
        url = URL.format(month=month)
        tmp = out.with_suffix(".download")
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "lectio-build"})
            with urllib.request.urlopen(request, timeout=300) as response, open(tmp, "wb") as f:
                shutil.copyfileobj(response, f)
            with gzip.open(tmp, "rb") as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
            tmp.unlink()
            print(f"IP location database {month}: {out.stat().st_size // (1024 * 1024)} MB")
            return 0
        except Exception as e:  # noqa: BLE001 - any failure: try the next month, then go without
            print(f"Couldn't fetch {url}: {e}")
            tmp.unlink(missing_ok=True)
            out.unlink(missing_ok=True)
    print("No IP location database; PCs without Windows Location will show their country only.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "data/dbip-city-lite.mmdb"))
