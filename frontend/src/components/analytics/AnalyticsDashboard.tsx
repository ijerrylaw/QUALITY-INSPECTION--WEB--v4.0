// React is unused here
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { TrendingDown, Activity, AlertOctagon } from 'lucide-react';

const PARETO_DATA = [
  { name: 'Weak Spot', count: 450, cumulative: 35 },
  { name: 'Stains', count: 320, cumulative: 60 },
  { name: 'Torn Cuff', count: 210, cumulative: 76 },
  { name: 'Hole at Crotch', count: 150, cumulative: 88 },
  { name: 'Discoloration', count: 90, cumulative: 95 },
  { name: 'Uneven Texture', count: 65, cumulative: 100 }
];

const PLANT_METRICS = [
  { name: 'Klang Plant', pass: 4500, fail: 340 },
  { name: 'Ipoh Plant', pass: 3200, fail: 150 },
  { name: 'Penang Plant', pass: 2800, fail: 90 },
];

const SEVERITY_DATA = [
  { name: 'Minor Visual', value: 600, color: '#08C8CD' }, // Brand Secondary
  { name: 'Major Visual', value: 400, color: '#F59E0B' }, // Amber
  { name: 'Critical', value: 200, color: '#EF4444' },     // Red
  { name: 'Zero Tolerance', value: 50, color: '#991B1B' } // Dark Red
];

// Tailwind hex equivalents for recharts
const COLORS = {
  canvas: '#0B0F19',
  surface: '#111827',
  muted: '#9CA3AF',
  primary: '#F3F4F6',
  brandPrimary: '#3F48CC',
  brandSecondary: '#08C8CD',
  emerald: '#10B981',
  rose: '#EF4444'
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-gray-700 p-4 rounded-lg shadow-xl">
        <p className="font-bold text-primary mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm font-mono flex justify-between gap-4">
            <span>{entry.name}:</span>
            <strong>{entry.value}{entry.name === 'Cumulative %' ? '%' : ''}</strong>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function AnalyticsDashboard() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brand-primary/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-brand-secondary" />
          </div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Total Inspections (30d)</p>
            <p className="text-3xl font-mono font-bold text-primary">11,080</p>
          </div>
        </div>
        
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <TrendingDown className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Global Pass Rate</p>
            <p className="text-3xl font-mono font-bold text-emerald-400">94.7%</p>
          </div>
        </div>

        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-rose-500/20 flex items-center justify-center">
            <AlertOctagon className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Critical Defect Rate</p>
            <p className="text-3xl font-mono font-bold text-rose-400">1.8%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Pareto Chart (Spans 2 columns on large screens) */}
        <div className="lg:col-span-2 bg-surface border border-gray-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-primary uppercase tracking-tight mb-6">
            Defect Frequency Pareto (Top 80%)
          </h3>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={PARETO_DATA} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke={COLORS.muted}
                  fontSize={12}
                  tickMargin={10}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke={COLORS.muted} 
                  fontSize={12}
                  fontFamily="JetBrains Mono"
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke={COLORS.brandSecondary} 
                  fontSize={12}
                  fontFamily="JetBrains Mono"
                  domain={[0, 100]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar 
                  yAxisId="left" 
                  dataKey="count" 
                  name="Defect Count" 
                  fill={COLORS.brandPrimary} 
                  radius={[4, 4, 0, 0]} 
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="cumulative" 
                  name="Cumulative %" 
                  stroke={COLORS.brandSecondary} 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: COLORS.canvas, stroke: COLORS.brandSecondary, strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Distribution Pie Chart */}
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-primary uppercase tracking-tight mb-6">
            Severity Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SEVERITY_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {SEVERITY_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 space-y-2">
            {SEVERITY_DATA.map(item => (
              <div key={item.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-primary">{item.name}</span>
                </div>
                <span className="font-mono text-muted">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plant Comparison Bar Chart */}
        <div className="lg:col-span-3 bg-surface border border-gray-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-primary uppercase tracking-tight mb-6">
            Facility Performance (Pass vs Fail)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PLANT_METRICS} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke={COLORS.muted} fontSize={12} tickMargin={10} />
                <YAxis stroke={COLORS.muted} fontSize={12} fontFamily="JetBrains Mono" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="pass" name="Passed Inspections" fill={COLORS.emerald} radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="fail" name="Failed Inspections" fill={COLORS.rose} radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
