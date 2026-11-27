# Alert thresholds

The rules themselves live in [`app/core/anomaly_rules.py`](../app/core/anomaly_rules.py). This page records
why each value was chosen, so a later change can be checked against the same reasoning.

Values come from a reference survey (November 2026) of manufacturer and standards sources: Intel and AMD
TjMax specifications, NVIDIA/AMD GPU temperature limits, the ATX12V / ATX 3.1 power supply design guides,
the NVMe health log definition, and Microsoft's documentation on commit charge, the page file, WHEA and
`Get-MpComputerStatus`. Where a limit depends on the exact hardware, a safe generic default is used until the
agent reports the device's own limit.

## Severity

| Severity | Meaning | Who hears about it |
|---|---|---|
| CRITICAL | Risk of damage, data loss, a crash or a shutdown | Dashboard, email, and a notification on the PC |
| WARNING | Worth a look soon: wearing, filling up or running hot | Dashboard, email, and a notification on the PC |
| INFO | Normal but notable load; no action needed | Dashboard only |

Readings arrive every 5 seconds, so every duration is a multiple of 5 s. "Lasts" is how long the value must
stay past the limit before an alert opens; "clears" is how long it must stay back in range before it closes.

## Rules

| Area | Reading | Warning | Critical | Lasts | Clears |
|---|---|---|---|---|---|
| CPU | Core temperature | ≥ 85 °C (TjMax − 15) | ≥ 95 °C (TjMax − 5) | 30 s | 30 s |
| CPU | Package temperature | ≥ 90 °C (TjMax − 10) | ≥ 100 °C (TjMax) | 30 s | 30 s |
| CPU | Thermal throttling | sustained | – | 30 s | 30 s |
| CPU | Utilization | INFO > 90 % | – | 60 s | 30 s |
| GPU | Core temperature | ≥ 85 °C | ≥ 93 °C | 30 s | 30 s |
| GPU | Hotspot temperature | ≥ 100 °C | ≥ 108 °C | 30 s | 30 s |
| GPU | Fan at 0 % while hot | GPU ≥ 65 °C | GPU ≥ 75 °C | 20 s | 30 s |
| GPU | Video memory used | ≥ 95 % of the card | – | 30 s | 30 s |
| GPU | Utilization | INFO > 95 % | – | 60 s | 30 s |
| Power | +12 V rail, low | < 11.40 V (−5 %) | < 11.16 V (−7 %) | 15 s | 30 s |
| Power | +12 V rail, high | – | > 12.60 V (+5 %) | 15 s | 30 s |
| Board | VRM temperature | ≥ 85 °C | ≥ 100 °C | 30 s | 30 s |
| Board | Chipset temperature | ≥ 75 °C | ≥ 85 °C | 30 s | 30 s |
| Board | Case fan while CPU/GPU ≥ 75 °C | – | < 200 RPM | 20 s | 30 s |
| Memory | RAM in use | ≥ 85 % | ≥ 95 % | 60 s | 30 s |
| Memory | Commit charge / commit limit | ≥ 85 % | ≥ 95 % | 30 s | 30 s |
| Memory | Page file in use | ≥ 70 % | ≥ 90 % | 60 s | 30 s |
| Storage | Drive life left (100 − NVMe "Percentage Used") | ≤ 20 % | ≤ 5 % | 60 s | 60 s |
| Storage | Bad + reallocated sectors | ≥ 1 | ≥ 10 | 60 s | never (counts don't fall) |
| Storage | Drive temperature (SSD/NVMe limits) | ≥ 70 °C | ≥ 80 °C | 60 s | 60 s |
| Storage | Fullest drive | ≥ 85 % used | ≥ 95 % used | 60 s | 60 s |
| Storage | Free space on C: | < 15 GB | < 5 GB | 60 s | 60 s |
| Storage | Disk busy | INFO ≥ 95 % | – | 3 min | 60 s |
| System | WHEA hardware errors, last 24 h | ≥ 3 | ≥ 10 | 5 s | 5 min |
| System | Open handles | > 300,000 | > 600,000 | 2 min | 60 s |
| System | Threads | > 8,000 | > 15,000 | 2 min | 60 s |
| System | Processes | > 400 | > 800 | 2 min | 60 s |
| System | Days since restart | INFO ≥ 30, WARNING ≥ 60 | – | 60 s | 5 s |
| Network | Busier direction / link speed | INFO ≥ 95 % | – | 60 s | 30 s |
| Security | Threat Defender hasn't dealt with | – | ≥ 1 | 5 s | 60 s |
| Security | Threat Defender stopped, last 24 h | ≥ 1 | – | 5 s | 60 s |
| Security | Real-time protection off, no other antivirus | – | on | 15 s | 15 s |
| Security | Windows program name running outside Windows' folders | – | ≥ 1 | 5 s | 60 s |
| Security | Virus definitions age (Defender in charge) | ≥ 3 days | ≥ 7 days | 60 s | 5 s |
| Security | Days since the last quick scan (Defender in charge) | > 14 | > 30 | 60 s | 5 s |

## Where these differ from the survey, and why

- **GPU video memory**: the survey suggested a warning at 85 % and critical at 95 %. Games and creative apps
  fill video memory on purpose, so only ≥ 95 % is reported, as a warning.
- **Network**: the survey suggested warning at 80 % and critical at 95 %. A big download fills the link on
  purpose, so it is INFO only.
- **Days since restart**: the survey suggested warning at 30 days and critical at 60. Not restarting is not a
  hardware risk, so 30 days is INFO and 60 days a warning.
- **CPU/GPU at 99 %**: the survey's critical level needs a responsiveness signal Lectio doesn't measure, so
  only the INFO level exists.
- **Disk busy**: should be paired with queue length and latency; until the agent reports those, INFO only.
- **Drive temperature**: hard drives are rated lower (about 55–60 °C) than SSDs, but the agent doesn't yet say
  which kind a drive is, so SSD/NVMe limits are used.

## Readings the Windows agent doesn't collect yet

These rules are ready but stay silent until the agent reports the reading: CPU package temperature, thermal
throttling, GPU hotspot, +12 V rail, VRM and chipset temperature, case fan speed, drive health, sectors and
drive temperature.

## Not tracked yet (from the survey, most important first)

1. Disk queue length and latency
2. NVMe available spare and critical-warning flags
3. GPU memory junction temperature and hotspot-to-core difference
4. Laptop battery wear and charger state
5. Pending restart, Windows Update failures and driver errors (Code 43 / Code 10)
6. Network packet loss and disconnections
