"""The agent's side of fixes: what each fix does on the PC, and the fix loop.

Windows tools are faked, so these run on any system.
"""

import json
import os
import time

import httpx
import pytest

from agent import fixes
from agent.fix_worker import EXIT_AUTH, FixWorker
from app.core.fix_catalogue import FIXES, fixes_for
from app.core.anomaly_rules import BASELINE_RULES


# ------------------------------------------------------------------ catalogue

def test_every_alert_rule_has_a_fix():
    for rule in BASELINE_RULES:
        assert fixes_for(rule.name), f"no fix offered for {rule.name}"


def test_every_pc_fix_has_steps_to_do_it_by_hand():
    # Shown to people who chose "Only suggest".
    for fix in FIXES.values():
        assert fix.manual or len(fix.how_to) > 20, fix.id


def test_every_runnable_fix_has_an_agent_runner():
    for fix in FIXES.values():
        assert fix.manual or fix.id in fixes.RUNNERS, fix.id
        if fix.undoable:
            assert fix.id in fixes.UNDOERS, fix.id


# ------------------------------------------------------------------ the agent refuses on its own

@pytest.mark.parametrize("fix_id, params", [
    ("format_drive", {}),
    ("clean_fans", {}),  # advice only
    ("close_app", {"process": "lsass.exe"}),
    ("cool_down", {"minutes": "60; del *"}),
    ("restart_service", {"service": "WinDefend"}),
])
def test_agent_refuses(fix_id, params):
    with pytest.raises(fixes.FixError):
        fixes.run_fix(fix_id, params)


def test_undo_needs_a_record():
    with pytest.raises(fixes.FixError):
        fixes.undo_fix("clear_temp_files", {"x": 1})  # not undoable
    with pytest.raises(fixes.FixError):
        fixes.undo_fix("cool_down", None)


# ------------------------------------------------------------------ cool down / power plan

@pytest.fixture
def fake_windows(monkeypatch):
    calls = []
    outputs = {}

    def run(args, timeout=60):
        calls.append(args)
        for key, out in outputs.items():
            if key in " ".join(args):
                return out
        return ""

    monkeypatch.setattr(fixes, "IS_WINDOWS", True)
    monkeypatch.setattr(fixes, "_run", run)
    return calls, outputs


QUERY = """Power Setting GUID: bc5038f7-23e0-4960-96da-33abaf5935ec  (Maximum processor state)
    Current AC Power Setting Index: 0x00000064
    Current DC Power Setting Index: 0x0000005a
"""


def test_cool_down_limits_and_records_previous(fake_windows):
    calls, outputs = fake_windows
    outputs["/query"] = QUERY
    message, undo = fixes.run_fix("cool_down", {"minutes": 30, "max_percent": 70})
    assert "70%" in message and "30 minutes" in message
    assert undo["ac"] == 100 and undo["dc"] == 90
    assert undo["revert_at"] == pytest.approx(time.time() + 30 * 60, abs=5)
    assert ["powercfg", "/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", "70"] in calls
    assert ["powercfg", "/setdcvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", "70"] in calls
    assert calls[-1] == ["powercfg", "/setactive", "SCHEME_CURRENT"]


def test_cool_down_undo_restores(fake_windows):
    calls, _ = fake_windows
    fixes.undo_fix("cool_down", {"ac": 100, "dc": 90})
    assert ["powercfg", "/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", "100"] in calls


def test_cool_down_undo_rejects_odd_values(fake_windows):
    with pytest.raises(fixes.FixError):
        fixes.undo_fix("cool_down", {"ac": 0, "dc": 100})


def test_balanced_power(fake_windows):
    calls, outputs = fake_windows
    outputs["/getactivescheme"] = "Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)"
    message, undo = fixes.run_fix("balanced_power", {})
    assert undo == {"plan": "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"}
    assert calls[-1] == ["powercfg", "/setactive", fixes.BALANCED_PLAN]
    fixes.undo_fix("balanced_power", undo)
    assert calls[-1] == ["powercfg", "/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"]


def test_balanced_power_already_balanced(fake_windows):
    _, outputs = fake_windows
    outputs["/getactivescheme"] = f"Power Scheme GUID: {fixes.BALANCED_PLAN}  (Balanced)"
    message, undo = fixes.run_fix("balanced_power", {})
    assert "already" in message and undo is None


def test_windows_only_fixes_fail_clearly_elsewhere(monkeypatch):
    monkeypatch.setattr(fixes, "IS_WINDOWS", False)
    with pytest.raises(fixes.FixError, match="only works on Windows"):
        fixes.run_fix("cool_down", {})


# ------------------------------------------------------------------ temp files

def test_clear_temp_files_removes_only_old_files(tmp_path):
    old = tmp_path / "old.tmp"
    new = tmp_path / "new.tmp"
    nested = tmp_path / "sub" / "old2.tmp"
    nested.parent.mkdir()
    for f in (old, new, nested):
        f.write_bytes(b"x" * 2048)
    two_days_ago = time.time() - 2 * 86400
    os.utime(old, (two_days_ago, two_days_ago))
    os.utime(nested, (two_days_ago, two_days_ago))

    message, undo = fixes.clear_temp_files({}, folder=tmp_path)
    assert not old.exists() and not nested.exists() and new.exists()
    assert not nested.parent.exists()  # emptied folders go too
    assert "2 temporary files" in message and undo is None


def test_clear_temp_files_nothing_to_do(tmp_path):
    (tmp_path / "fresh.tmp").write_text("x")
    message, _ = fixes.clear_temp_files({}, folder=tmp_path)
    assert "no old temporary files" in message


# ------------------------------------------------------------------ close an app

def test_close_app_not_running(monkeypatch):
    import psutil
    monkeypatch.setattr(psutil, "process_iter", lambda attrs=None: iter([]))
    message, undo = fixes.close_app({"process": "chrome.exe"})
    assert "wasn't running" in message and undo is None


# ------------------------------------------------------------------ startup apps

class FakeWinreg:
    HKEY_CURRENT_USER = "HKCU"
    KEY_READ = 1
    KEY_SET_VALUE = 2
    REG_SZ = 1

    def __init__(self, values):
        self.values = dict(values)

    def OpenKey(self, hive, path, reserved, access):
        assert hive == "HKCU" and path == fixes.RUN_KEY
        fake = self

        class Key:
            def __enter__(self):
                return fake

            def __exit__(self, *exc):
                return False
        return Key()

    def QueryValueEx(self, key, name):
        if name not in self.values:
            raise FileNotFoundError(name)
        return self.values[name], self.REG_SZ

    def DeleteValue(self, key, name):
        del self.values[name]

    def SetValueEx(self, key, name, reserved, kind, value):
        self.values[name] = value


def test_disable_and_restore_startup_app():
    reg = FakeWinreg({"Spotify": r'"C:\Spotify\Spotify.exe" /minimized'})
    message, undo = fixes.disable_startup_app({"name": "Spotify"}, winreg=reg)
    assert "Spotify" not in reg.values and "won't start" in message
    fixes.undo_disable_startup_app(undo, winreg=reg)
    assert reg.values["Spotify"] == r'"C:\Spotify\Spotify.exe" /minimized'


def test_disable_missing_startup_app():
    with pytest.raises(fixes.FixError, match="Couldn't find"):
        fixes.disable_startup_app({"name": "Nope"}, winreg=FakeWinreg({}))


# ------------------------------------------------------------------ the fix loop

class FakeServer:
    """Plays the API for the FixWorker over httpx.MockTransport."""

    def __init__(self, fixes_to_send=()):
        self.queue = list(fixes_to_send)
        self.results = {}
        self.reverted = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("X-Device-Key") != "key":
            return httpx.Response(401)
        path = request.url.path
        if path == "/api/v1/agent/fixes/next":
            assert request.url.params.get("agent_version")
            return httpx.Response(200, json={"fix": self.queue.pop(0) if self.queue else None, "poll_seconds": 10})
        if path.endswith("/result"):
            self.results[path.split("/")[-2]] = json.loads(request.content)
            return httpx.Response(200, json={})
        if path.endswith("/reverted"):
            self.reverted.append(path.split("/")[-2])
            return httpx.Response(200, json={})
        return httpx.Response(404)


def make_worker(server, config=None, ask=lambda title, summary: True, key="key"):
    client = httpx.AsyncClient(transport=httpx.MockTransport(server.handler), base_url="http://api")
    saved = []
    worker = FixWorker(client, "http://api", {"X-Device-Key": key}, config if config is not None else {},
                       saved.append, ask=ask)
    return worker, saved


def a_fix(**over):
    fix = {"id": "f1", "fix_id": "cool_down", "title": "Cool it down now", "summary": "s",
           "params": {"minutes": 60, "max_percent": 80}, "needs_pc_approval": False, "undo": False, "undo_of": None}
    fix.update(over)
    return fix


async def test_worker_runs_and_keeps_its_own_undo_record(fake_windows):
    _, outputs = fake_windows
    outputs["/query"] = QUERY
    server = FakeServer([a_fix()])
    worker, saved = make_worker(server)
    assert await worker.check_once() == 0
    result = server.results["f1"]
    assert result["status"] == "succeeded"
    assert result["undo_data"] == {"recorded": True}  # the details stay on the PC
    assert worker.config["undo_records"]["f1"]["data"]["ac"] == 100
    assert worker.config["timed_reverts"][0]["request_id"] == "f1"
    assert saved


async def test_worker_asks_on_the_pc_for_big_fixes():
    asked = []
    server = FakeServer([a_fix(id="f2", fix_id="check_disk", title="Check the drive for errors", params={},
                               needs_pc_approval=True)])
    worker, _ = make_worker(server, ask=lambda title, summary: asked.append(title) or False)
    await worker.check_once()
    assert asked == ["Check the drive for errors"]
    assert server.results["f2"]["status"] == "declined"
    assert "undo_records" not in worker.config or not worker.config["undo_records"]  # nothing ran


async def test_worker_undo_uses_only_its_local_record(fake_windows):
    calls, _ = fake_windows
    config = {"undo_records": {"f1": {"fix_id": "cool_down", "data": {"ac": 100, "dc": 90}}}}
    # Whatever the server might send is ignored: the payload has no undo data.
    server = FakeServer([a_fix(id="u1", undo=True, undo_of="f1")])
    worker, _ = make_worker(server, config=config)
    await worker.check_once()
    assert server.results["u1"]["status"] == "succeeded"
    assert ["powercfg", "/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", "100"] in calls
    assert "f1" not in worker.config["undo_records"]


async def test_worker_refuses_undo_without_a_record():
    server = FakeServer([a_fix(id="u2", fix_id="disable_startup_app", undo=True, undo_of="unknown")])
    worker, _ = make_worker(server)
    await worker.check_once()
    assert server.results["u2"]["status"] == "failed"
    assert "no record" in server.results["u2"]["message"]


async def test_worker_reverts_timed_fixes(fake_windows):
    calls, _ = fake_windows
    config = {
        "undo_records": {"f1": {"fix_id": "cool_down", "data": {"ac": 100, "dc": 100, "revert_at": 1}}},
        "timed_reverts": [{"request_id": "f1", "at": 1}],
    }
    server = FakeServer()
    worker, _ = make_worker(server, config=config)
    await worker.revert_due(now=2)
    assert server.reverted == ["f1"]
    assert worker.config["timed_reverts"] == [] and "f1" not in worker.config["undo_records"]
    assert ["powercfg", "/setactive", "SCHEME_CURRENT"] in calls


async def test_worker_failure_is_reported_plainly(monkeypatch):
    monkeypatch.setattr(fixes, "IS_WINDOWS", False)
    server = FakeServer([a_fix(id="f3")])
    worker, _ = make_worker(server)
    await worker.check_once()
    assert server.results["f3"] == {"status": "failed", "message": "This fix only works on Windows.", "undo_data": None}


async def test_worker_stops_when_the_key_is_rejected():
    worker, _ = make_worker(FakeServer(), key="wrong")
    assert await worker.check_once() is None
    assert await worker.run() == EXIT_AUTH
