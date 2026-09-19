export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-xs uppercase tracking-wide opacity-50">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
    </div>
  );
}
