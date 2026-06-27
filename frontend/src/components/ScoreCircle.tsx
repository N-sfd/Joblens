interface Props {
  score: number;
  label: string;
  size?: number;
  strokeColor?: string;
}

export default function ScoreCircle({ score, label, size = 120, strokeColor = "#6366f1" }: Props) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  const color =
    score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  const finalColor = strokeColor !== "#6366f1" ? strokeColor : color;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)" }}
          aria-label={`${label}: ${score}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="7"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={finalColor}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900 tracking-tight">{score}</span>
          <span className="text-[11px] text-slate-400 font-medium">/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-600 text-center uppercase tracking-wide">{label}</span>
    </div>
  );
}
