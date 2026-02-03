interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: {
    value: number;
    label: string;
  };
}

export default function StatsCard({ title, value, subtitle, icon, trend }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm font-medium text-gray-600 truncate">{title}</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
          {subtitle && <p className="text-xs md:text-sm text-gray-500 mt-1 truncate">{subtitle}</p>}
          {trend && (
            <p className={`text-xs md:text-sm mt-2 ${trend.value >= 0 ? "text-green-600" : "text-red-600"}`}>
              {trend.value >= 0 ? "+" : ""}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {icon && <span className="text-2xl md:text-3xl flex-shrink-0">{icon}</span>}
      </div>
    </div>
  );
}
