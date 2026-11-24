// Package models holds the JSON shapes the Lectio API accepts and returns.
//
// They mirror the FastAPI models in app/models/telemetry.py (TelemetrySnapshot
// and its parts), app/schemas/api.py and app/api/v1/fixes.py. Optional readings
// are pointers so a reading the PC can't provide is sent as null, never as a
// made-up zero.
package models

import "time"

type CPU struct {
	CoreTemperatureC    *float64 `json:"core_temperature_c"`
	PackageTemperatureC *float64 `json:"package_temperature_c"`
	UtilizationPercent  *float64 `json:"utilization_percent"`
	ClockSpeedGHz       *float64 `json:"clock_speed_ghz"`
	PackagePowerW       *float64 `json:"package_power_w"`
	FanSpeedRPM         *int     `json:"fan_speed_rpm"`
	ThermalThrottling   *bool    `json:"thermal_throttling"`
	ProcessCount        *int     `json:"process_count"`
	ThreadCount         *int     `json:"thread_count"`
	HandleCount         *int     `json:"handle_count"`
	UptimeSeconds       *int64   `json:"uptime_seconds"`
}

type GPU struct {
	CoreTemperatureC    *float64 `json:"core_temperature_c"`
	HotspotTemperatureC *float64 `json:"hotspot_temperature_c"`
	UtilizationPercent  *float64 `json:"utilization_percent"`
	FanSpeedPercent     *float64 `json:"fan_speed_percent"`
	VRAMUsedGB          *float64 `json:"vram_used_gb"`
	VRAMTotalGB         *float64 `json:"vram_total_gb"`
	SharedMemoryUsedGB  *float64 `json:"shared_memory_used_gb"`
	BoardPowerW         *float64 `json:"board_power_w"`
	GPUName             *string  `json:"gpu_name"`
}

type Storage struct {
	DeviceName             *string  `json:"device_name"`
	SmartHealthPercent     *int     `json:"smart_health_percent"`
	TotalBytesWrittenTBW   *float64 `json:"total_bytes_written_tbw"`
	TemperatureC           *float64 `json:"temperature_c"`
	ReallocatedSectorCount *int     `json:"reallocated_sector_count"`
	BadSectorCount         *int     `json:"bad_sector_count"`
	AvailableCapacityGB    *float64 `json:"available_capacity_gb"`
	TotalCapacityGB        *float64 `json:"total_capacity_gb"`
}

type RAM struct {
	UsagePercent         *float64 `json:"usage_percent"`
	UsedGB               *float64 `json:"used_gb"`
	TotalGB              *float64 `json:"total_gb"`
	PagefileUsagePercent *float64 `json:"pagefile_usage_percent"`
	WHEAErrorCount       int      `json:"whea_error_count"`
	CommittedGB          *float64 `json:"committed_gb"`
	CommitLimitGB        *float64 `json:"commit_limit_gb"`
}

type PowerVRM struct {
	VRMTemperatureC     *float64 `json:"vrm_temperature_c"`
	PSU12VVoltage       *float64 `json:"psu_12v_voltage"`
	ChipsetTemperatureC *float64 `json:"chipset_temperature_c"`
	ChassisFanSpeedRPM  *int     `json:"chassis_fan_speed_rpm"`
}

type DiskActivity struct {
	ActivePercent  *float64 `json:"active_percent"`
	ReadBytesPerS  *float64 `json:"read_bytes_per_s"`
	WriteBytesPerS *float64 `json:"write_bytes_per_s"`
}

type Network struct {
	AdapterName      *string  `json:"adapter_name"`
	ReceiveBytesPerS *float64 `json:"receive_bytes_per_s"`
	SendBytesPerS    *float64 `json:"send_bytes_per_s"`
	LinkSpeedMbps    *float64 `json:"link_speed_mbps"`
}

type Process struct {
	Name          string   `json:"name"`
	PID           int32    `json:"pid"`
	CPUPercent    float64  `json:"cpu_percent"`
	MemoryMB      *float64 `json:"memory_mb"`
	DiskBytesPerS *float64 `json:"disk_bytes_per_s"`
}

// Snapshot is one reading of the whole PC (TelemetrySnapshot on the server).
type Snapshot struct {
	Timestamp            time.Time    `json:"timestamp"`
	SensorID             string       `json:"sensor_id"`
	CPU                  CPU          `json:"cpu"`
	GPU                  GPU          `json:"gpu"`
	Storage              []Storage    `json:"storage"`
	RAM                  RAM          `json:"ram"`
	PowerVRM             PowerVRM     `json:"power_vrm"`
	Disk                 DiskActivity `json:"disk"`
	Network              Network      `json:"network"`
	Processes            []Process    `json:"processes"`
	CollectionDurationMS *float64     `json:"collection_duration_ms"`
}

// Reading is a snapshot plus the agent's unique id for it, as sent in a batch.
// The server stores each event id once per device, so resending is safe.
type Reading struct {
	EventID string `json:"event_id"`
	Snapshot
}

type Batch struct {
	Readings []Reading `json:"readings"`
}

// BatchResponse is POST /telemetry/ingest/batch's reply.
type BatchResponse struct {
	Status     string `json:"status"`
	Received   int    `json:"received"`
	Stored     int    `json:"stored"`
	Duplicates int    `json:"duplicates"`
	TooOld     int    `json:"too_old"`
}

// ---------------------------------------------------------------- linking

type LoginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

type RegisterRequest struct {
	DeviceName string  `json:"device_name"`
	SystemUUID string  `json:"system_uuid"`
	OSInfo     string  `json:"os_info,omitempty"`
	Country    *string `json:"country,omitempty"`
}

type Device struct {
	ID         string `json:"id"`
	DeviceName string `json:"device_name"`
}

type RegisterResponse struct {
	Device    Device `json:"device"`
	DeviceKey string `json:"device_key"`
}

// ---------------------------------------------------------------- fixes

// AgentFix is a fix the website asked this PC to run (or undo).
type AgentFix struct {
	ID              string         `json:"id"`
	FixID           string         `json:"fix_id"`
	Title           string         `json:"title"`
	Summary         string         `json:"summary"`
	Params          map[string]any `json:"params"`
	NeedsPCApproval bool           `json:"needs_pc_approval"`
	Undo            bool           `json:"undo"`
	UndoOf          *string        `json:"undo_of"`
}

type AgentNext struct {
	Fix         *AgentFix `json:"fix"`
	PollSeconds int       `json:"poll_seconds"`
}

type FixResult struct {
	Status   string         `json:"status"` // succeeded, failed or declined
	Message  string         `json:"message"`
	UndoData map[string]any `json:"undo_data"`
}
