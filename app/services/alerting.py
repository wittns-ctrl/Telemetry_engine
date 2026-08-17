from app.models.telemetry import TelemetryPayload

# Define alert thresholds

THRESHOLDS = {
    "temperature": {"field":"value","max":100.0, "unit":"°C"},
    "cpu":{"field":"value","max":90.0,"unit":"%"},
    "network":{"field":"value","max":1000.0,"unit":"MB/s"}
}

def evaluate_metric_alert(payload: TelemetryPayload) -> dict | None:
    rule = THRESHOLDS.get(payload.metric_type)
    if not rule:
        return None

    if payload.value > rule["max"]:
        return{
            "event":"THRESHOLD_BREACH",
            "severity":"CRITICAL",
            "sensor_id": payload.sensor_id,
            "metric_type": payload.metric_type,
            "current_value": payload.value,
            "threshold_max": rule["max"],
            "unit": rule["unit"],
            "message":f"CRITICAL: {payload.sensor_id} {payload.metric_type} is at {payload.value}{rule['unit']} (Exceeds limit of {rule['max']}{rule['unit']})!"
        }

    return None 