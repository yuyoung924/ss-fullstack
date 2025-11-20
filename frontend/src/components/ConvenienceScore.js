import { Store, TrendingUp } from 'lucide-react';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function ConvenienceScore({ score, facilities, onFacilitySelect }) {
  const getConvenienceLevel = (score) => {
    if (score >= 80) return { text: '매우 편리', color: 'text-green-600' };
    if (score >= 60) return { text: '편리', color: 'text-blue-600' };
    if (score >= 40) return { text: '보통', color: 'text-yellow-600' };
    return { text: '불편', color: 'text-red-600' };
  };

  const level = getConvenienceLevel(score);

  // chartData 확실하게 보장
  const chartData = facilities.map((f) => ({
    name: f.name,
    count: f.count,
  }));

  const facilityTypes = [
    "convenience_store",
    "pharmacy",
    "hospital",
    "police_station",
  ];

  return (
    <Card className="p-6 bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Store className="w-5 h-5 text-green-600" />
            <h3 className="text-gray-900">편의성 지수</h3>
          </div>
          <p className="text-gray-500">주변 필수 시설 밀집도 (Google Places 기반)</p>
        </div>

        <div className={`text-right ${level.color}`}>
          <div className="text-4xl mb-1">{score}</div>
          <div className="text-sm">{level.text}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-600">편의성 점수</span>
          <span className="text-gray-900">{score}/100</span>
        </div>
        <Progress value={score} className="h-3" />
      </div>

      {/* Bar Chart */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3 text-gray-700">
          <TrendingUp className="w-4 h-4" />
          <span>1km 거리 내 편의 시설 현황</span>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            
            <XAxis 
              dataKey="name"
              tick={{ fontSize: 12 }}
              type="category"
            />

            <YAxis 
              allowDecimals={false}
              domain={[0, 'dataMax + 5']}
              tick={{ fontSize: 12 }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />

            <Bar
              dataKey="count"
              fill="#10b981"
              radius={[8, 8, 0, 0]}
              onClick={(entry) => {
                if (onFacilitySelect) onFacilitySelect(entry.name);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Facility Cards */}
      <div className="grid grid-cols-2 gap-3">
        {facilities.map((f, idx) => (
          <div key={idx} className="p-3 bg-green-50 rounded-lg">
            <div className="text-gray-600 mb-1">{f.name}</div>
            <div className="text-gray-900">{f.count}개</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
