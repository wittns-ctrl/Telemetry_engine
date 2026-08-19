import React from "react";
import {
  Users,
  Server,
  Radio,
  User,
  UserCheck,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export function TeamView({ stats }) {
  const sensors = stats?.recent_sensors || [
    "sensor_server_101",
    "sensor_edge_node_4",
    "sensor_db_cluster_a",
    "sensor_gateway_01",
  ];

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Sensors & Team
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Active sensor stream nodes and authorized platform administrators.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sensor Nodes */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Active Telemetry Sensors
              </h2>
              <p className="text-xs text-slate-400">
                Connected streaming nodes
              </p>
            </div>
            <Server className="w-5 h-5 text-[#0b4d36]" />
          </div>

          <div className="space-y-3">
            {sensors.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#0b4d36] font-bold text-xs flex items-center justify-center">
                    <Radio className="w-4 h-4 text-[#0b4d36]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 font-mono">
                      {s}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Stream Protocol: WebSocket / REST
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ONLINE
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Authorized Team Members */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Authorized Team Members
              </h2>
              <p className="text-xs text-slate-400">
                Platform access role permissions
              </p>
            </div>
            <Users className="w-5 h-5 text-[#0b4d36]" />
          </div>

          <div className="space-y-3">
            {[
              {
                name: "Totok Michael",
                email: "tmichael20@gmail.com",
                role: "Administrator",
                icon: UserCheck,
              },
              {
                name: "Alexandra Deff",
                email: "alexandra@example.com",
                role: "DevOps Engineer",
                icon: User,
              },
              {
                name: "Edwin Adenike",
                email: "edwin@example.com",
                role: "Security Analyst",
                icon: ShieldCheck,
              },
              {
                name: "Mugisha B.",
                email: "mugisha@example.com",
                role: "System Admin",
                icon: Wrench,
              },
            ].map((m, idx) => {
              const UserIcon = m.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-amber-800" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {m.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {m.email}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                    {m.role}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
