"""
The fixes Lectio can carry out on a PC.

This list is the whole of what the agent will ever do to a machine. The AI may
choose among these and explain them in plain words, but it never writes its
own commands: every fix here is implemented and tested in agent/fixes.py, and
anything not in this list is refused by both the API and the agent.

Each fix has:
  title / summary   plain, short wording shown to the user
  size              "small": quick and undoable, runs once chosen on the website
                    "big":   also needs "Allow" on the PC before it runs
  undoable          whether the agent can put things back afterwards
  params            allowed parameters, each with a validator
  helps_with        alert rule names (app/core/anomaly_rules.py) it can help with
  manual            True for advice the user carries out themselves; the agent
                    never runs these
  how_to            plain steps to do it by hand, for people who chose
                    "Only suggest" (manual fixes use their summary)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

SMALL = "small"
BIG = "big"

# Windows services the agent may restart. Others are refused.
RESTARTABLE_SERVICES = {
    "Spooler": "Print queue",
    "AudioSrv": "Windows Audio",
    "wuauserv": "Windows Update",
    "WSearch": "Windows Search",
}

_PROCESS_NAME = re.compile(r"^[A-Za-z0-9 ._()+-]{1,64}\.exe$", re.IGNORECASE)
_STARTUP_NAME = re.compile(r"^[^\\/\x00-\x1f]{1,128}$")

# Processes the agent will never close, whatever is asked.
PROTECTED_PROCESSES = {
    "system", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe",
    "lsass.exe", "svchost.exe", "explorer.exe", "dwm.exe", "fontdrvhost.exe",
    "msmpeng.exe", "securityhealthservice.exe", "registry", "memory compression",
}


def _minutes(value: Any) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 15 <= value <= 240:
        raise ValueError("minutes must be a whole number from 15 to 240")
    return value


def _percent(value: Any) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 50 <= value <= 95:
        raise ValueError("max_percent must be a whole number from 50 to 95")
    return value


def _process(value: Any) -> str:
    if not isinstance(value, str) or not _PROCESS_NAME.match(value):
        raise ValueError("process must be a program name such as chrome.exe")
    if value.lower() in PROTECTED_PROCESSES:
        raise ValueError(f"{value} is part of Windows and can't be closed")
    return value


def _startup(value: Any) -> str:
    if not isinstance(value, str) or not _STARTUP_NAME.match(value.strip()):
        raise ValueError("name must be the name of a startup entry")
    return value.strip()


def _service(value: Any) -> str:
    if value not in RESTARTABLE_SERVICES:
        raise ValueError(f"service must be one of: {', '.join(RESTARTABLE_SERVICES)}")
    return value


@dataclass(frozen=True)
class Param:
    validate: Callable[[Any], Any]
    required: bool = True
    default: Any = None


@dataclass(frozen=True)
class Fix:
    id: str
    title: str
    summary: str
    size: str
    undoable: bool
    params: dict[str, Param] = field(default_factory=dict)
    helps_with: tuple[str, ...] = ()
    manual: bool = False
    how_to: str = ""

    @property
    def needs_pc_approval(self) -> bool:
        return self.size == BIG

    def clean_params(self, raw: dict | None) -> dict:
        """Validated parameters, or ValueError naming the problem."""
        raw = dict(raw or {})
        unknown = set(raw) - set(self.params)
        if unknown:
            raise ValueError(f"unknown parameter(s): {', '.join(sorted(unknown))}")
        out = {}
        for name, spec in self.params.items():
            if name in raw:
                out[name] = spec.validate(raw[name])
            elif spec.required:
                raise ValueError(f"{name} is required")
            elif spec.default is not None:
                out[name] = spec.default
        return out


HEAT = (
    "CPU_OVERHEATING_CRITICAL", "CPU_OVERHEATING_WARNING", "CPU_PACKAGE_OVERHEATING_CRITICAL",
    "VRM_OVERHEATING_CRITICAL", "VRM_OVERHEATING_WARNING",
)
GPU_HEAT = ("GPU_HOTSPOT_CRITICAL", "GPU_CORE_OVERHEATING_WARNING")
LOAD = ("CPU_HIGH_UTILIZATION_INFO", "GPU_HIGH_UTILIZATION_INFO")
DISK = ("NVME_HEALTH_LOW_WARNING", "NVME_HEALTH_CRITICAL")
ERRORS = ("WHEA_ERROR_SPIKE_WARNING",)
POWER = ("PSU_12V_UNDERVOLTAGE_CRITICAL", "PSU_12V_OVERVOLTAGE_CRITICAL")

FIXES: dict[str, Fix] = {f.id: f for f in [
    Fix(
        "cool_down", "Cool it down now",
        "Lower the processor's top speed for a while. Your PC may feel a bit slower, but much cooler.",
        SMALL, undoable=True,
        params={"minutes": Param(_minutes, required=False, default=60),
                "max_percent": Param(_percent, required=False, default=80)},
        helps_with=HEAT + LOAD,
        how_to='Open Control Panel, then Power Options, Change plan settings, Change advanced power settings. Under Processor power management, set Maximum processor state to 80%.'
    ),
    Fix(
        "balanced_power", "Switch to the Balanced power plan",
        "Stop the PC running at full power all the time. Saves heat and electricity.",
        SMALL, undoable=True, helps_with=HEAT + GPU_HEAT + LOAD,
        how_to='Open Control Panel, then Power Options, and choose Balanced.'
    ),
    Fix(
        "clear_temp_files", "Clear temporary files",
        "Delete leftover temporary files more than a day old to free up disk space.",
        SMALL, undoable=False, helps_with=DISK,
        how_to='Press Windows + R, type %temp% and press Enter. Select everything and delete it, skipping any files that are in use.'
    ),
    Fix(
        "close_app", "Close the app using the most power",
        "Close a program that's working the PC hard. Save your work in it first.",
        BIG, undoable=False, params={"process": Param(_process)}, helps_with=HEAT + GPU_HEAT + LOAD,
        how_to='Save your work, press Ctrl + Shift + Esc, select the app using the most CPU, and click End task.'
    ),
    Fix(
        "disable_startup_app", "Stop an app starting with Windows",
        "Keep a program from opening by itself every time the PC starts. You can turn it back on.",
        BIG, undoable=True, params={"name": Param(_startup)}, helps_with=LOAD,
        how_to='Press Ctrl + Shift + Esc, open Startup apps, select the app and click Disable.'
    ),
    Fix(
        "restart_service", "Restart a stuck Windows service",
        "Turn a Windows background service off and on again.",
        BIG, undoable=False, params={"service": Param(_service)}, helps_with=ERRORS,
        how_to='Press Windows + R, type services.msc and press Enter. Right-click the service and choose Restart.'
    ),
    Fix(
        "repair_system_files", "Repair Windows system files",
        "Run Windows' own check that finds and repairs damaged system files. Takes 10 to 20 minutes.",
        BIG, undoable=False, helps_with=ERRORS,
        how_to='Search the Start menu for Command Prompt and choose Run as administrator. Type sfc /scannow and press Enter.'
    ),
    Fix(
        "check_disk", "Check the drive for errors",
        "Run Windows' own drive check. It only looks, it doesn't change anything.",
        BIG, undoable=False, helps_with=DISK + ERRORS,
        how_to='Open File Explorer, right-click drive C:, choose Properties, then Tools, then Check.'
    ),
    # Advice only: things software can't do. The agent never runs these.
    Fix(
        "clean_fans", "Clean the fans",
        "Dust may be blocking the air. Switch off, unplug, and blow out the vents and fans.",
        SMALL, undoable=False, helps_with=HEAT + GPU_HEAT, manual=True,
    ),
    Fix(
        "back_up_now", "Back up your files now",
        "This drive is wearing out. Copy your important files somewhere safe today.",
        SMALL, undoable=False, helps_with=DISK, manual=True,
    ),
    Fix(
        "check_power_supply", "Have the power supply checked",
        "The power the PC gets is outside the safe range. A technician should check the power supply.",
        SMALL, undoable=False, helps_with=POWER, manual=True,
    ),
]}


def get_fix(fix_id: str) -> Fix | None:
    return FIXES.get(fix_id)


def fixes_for(rule_name: str) -> list[Fix]:
    """Catalogue fixes that can help with an alert rule, agent fixes first."""
    found = [f for f in FIXES.values() if rule_name in f.helps_with]
    return sorted(found, key=lambda f: f.manual)
