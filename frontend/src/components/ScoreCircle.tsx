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
            stroke="#e2e8f0"
            strokeWidth="8"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={finalColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-800">{score}</span>
          <span className="text-xs text-slate-400">/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-600 text-center">{label}</span>
    </div>
  );
}
