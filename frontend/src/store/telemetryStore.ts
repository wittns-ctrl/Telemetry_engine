import { create } from 'zustand';

export interface TelemetryMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  threshold: number;
  timestamp: Date;
}

export interface Sensor {
  id: string;
  name: string;
  status: 'online' | 'warning' | 'offline';
  value: number;
  unit: string;
  threshold: number;
}

export interface Alert {
  id: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  metricName: string;
  triggerValue: number;
  thresholdLimit: number;
  message: string;
  timestamp: Date;
  isActive: boolean;
}

export interface TelemetryChannel {
  id: string;
  name: string;
  protocol: 'WebSocket' | 'REST';
  status: 'active' | 'inactive';
  lastSeen: Date;
}

interface TelemetryState {
  // Metrics
  totalMetricsIngested: number;
  temperatureStreams: number;
  cpuLoadStreams: number;
  networkThroughput: number;
  temperatureLimit: number;
  cpuLimit: number;
  networkLimit: number;

  // Alerts
  activeAlerts: Alert[];
  alertsCount: number;

  // Sensors
  monitoredSensors: Sensor[];

  // Channels
  telemetryChannels: TelemetryChannel[];

  // System Safety
  systemSafetyPercentage: number;

  // Actions
  updateMetric: (metric: keyof TelemetryState, value: number) => void;
  addAlert: (alert: Alert) => void;
  removeAlert: (alertId: string) => void;
  updateSensor: (sensor: Sensor) => void;
  addChannel: (channel: TelemetryChannel) => void;
  removeChannel: (channelId: string) => void;
  updateSystemSafety: (percentage: number) => void;
  reset: () => void;
}

const initialState = {
  totalMetricsIngested: 48,
  temperatureStreams: 21,
  cpuLoadStreams: 25,
  networkThroughput: 4,
  temperatureLimit: 100,
  cpuLimit: 90,
  networkLimit: 1000,
  activeAlerts: [],
  alertsCount: 0,
  monitoredSensors: [
    { id: '1', name: 'CPU Core Temp', status: 'online', value: 22.4, unit: '°C', threshold: 90 },
    { id: '2', name: 'GPU Temp', status: 'online', value: 45, unit: '%', threshold: 95 },
    { id: '3', name: 'VRM Temp', status: 'warning', value: 85, unit: '°C', threshold: 100 },
    { id: '4', name: 'PSU Voltage', status: 'online', value: 12.1, unit: 'V', threshold: 12.6 },
  ],
  telemetryChannels: [
    { id: '1', name: 'sensor_server_101', protocol: 'WebSocket', status: 'active', lastSeen: new Date() },
    { id: '2', name: 'sensor_server_102', protocol: 'REST', status: 'active', lastSeen: new Date() },
    { id: '3', name: 'sensor_server_103', protocol: 'WebSocket', status: 'inactive', lastSeen: new Date() },
  ],
  systemSafetyPercentage: 96,
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  ...initialState,

  updateMetric: (metric, value) =>
    set((state) => ({
      ...state,
      [metric]: value,
    })),

  addAlert: (alert) =>
    set((state) => ({
      ...state,
      activeAlerts: [...state.activeAlerts, alert],
      alertsCount: state.alertsCount + 1,
    })),

  removeAlert: (alertId) =>
    set((state) => ({
      ...state,
      activeAlerts: state.activeAlerts.filter((a) => a.id !== alertId),
      alertsCount: Math.max(0, state.alertsCount - 1),
    })),

  updateSensor: (sensor) =>
    set((state) => ({
      ...state,
      monitoredSensors: state.monitoredSensors.map((s) =>
        s.id === sensor.id ? sensor : s
      ),
    })),

  addChannel: (channel) =>
    set((state) => ({
      ...state,
      telemetryChannels: [...state.telemetryChannels, channel],
    })),

  removeChannel: (channelId) =>
    set((state) => ({
      ...state,
      telemetryChannels: state.telemetryChannels.filter((c) => c.id !== channelId),
    })),

  updateSystemSafety: (percentage) =>
    set((state) => ({
      ...state,
      systemSafetyPercentage: percentage,
    })),

  reset: () => set(initialState),
}));
