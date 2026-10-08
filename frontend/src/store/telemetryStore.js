import { create } from 'zustand';

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
    {
      id: '1',
      name: 'sensor_room_101',
      status: 'online',
      valueLabel: 'Temp: 22.4°C',
      limitLabel: 'Limit: 120°C',
    },
    {
      id: '2',
      name: 'sensor_k8s_node_02',
      status: 'online',
      valueLabel: 'CPU: 45%',
      limitLabel: 'Limit: 90%',
    },
    {
      id: '3',
      name: 'sensor_edge_router_01',
      status: 'online',
      valueLabel: 'Network: 432 MB/s',
      limitLabel: 'Limit: 1000 MB/s',
    },
    {
      id: '4',
      name: 'sensor_gateway_redundant',
      status: 'warning',
      valueLabel: 'Temp: 115°C',
      limitLabel: 'Limit: 120°C',
    },
    {
      id: '5',
      name: 'sensor_gateway_primary',
      status: 'online',
      valueLabel: 'Network: 98 MB/s',
      limitLabel: 'Limit: 1000 MB/s',
    },
  ],
  telemetryChannels: [
    {
      id: '1',
      name: 'sensor_server_101',
      protocol: 'WebSocket',
      status: 'active',
      lastSeen: new Date(),
    },
    {
      id: '2',
      name: 'sensor_edge_node_4',
      protocol: 'WebSocket',
      status: 'active',
      lastSeen: new Date(),
    },
    {
      id: '3',
      name: 'sensor_db_cluster_a',
      protocol: 'WebSocket',
      status: 'active',
      lastSeen: new Date(),
    },
  ],
  systemSafetyPercentage: 96,
};

export const useTelemetryStore = create((set) => ({
  ...initialState,

  setTotalMetrics: (value) => set({ totalMetricsIngested: value }),
  setTemperatureStreams: (value) => set({ temperatureStreams: value }),
  setCpuLoadStreams: (value) => set({ cpuLoadStreams: value }),
  setNetworkThroughput: (value) => set({ networkThroughput: value }),

  addAlert: (alert) =>
    set((state) => ({
      activeAlerts: [...state.activeAlerts, alert],
      alertsCount: state.alertsCount + 1,
    })),

  removeAlert: (alertId) =>
    set((state) => ({
      activeAlerts: state.activeAlerts.filter((a) => a.id !== alertId),
      alertsCount: Math.max(0, state.alertsCount - 1),
    })),

  updateSensor: (sensor) =>
    set((state) => ({
      monitoredSensors: state.monitoredSensors.map((s) =>
        s.id === sensor.id ? sensor : s
      ),
    })),

  addChannel: (channel) =>
    set((state) => ({
      telemetryChannels: [...state.telemetryChannels, channel],
    })),

  removeChannel: (channelId) =>
    set((state) => ({
      telemetryChannels: state.telemetryChannels.filter((c) => c.id !== channelId),
    })),

  updateSystemSafety: (percentage) => set({ systemSafetyPercentage: percentage }),

  reset: () => set(initialState),
}));
