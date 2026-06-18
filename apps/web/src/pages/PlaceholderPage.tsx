import { Construction } from 'lucide-react';

interface Props { title: string }

export default function PlaceholderPage({ title }: Props) {
  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-64 text-center">
      <Construction size={40} className="text-slate-300 mb-4" />
      <h2 className="text-xl font-semibold text-slate-600">{title}</h2>
      <p className="text-slate-400 text-sm mt-2">Module en cours de développement.</p>
    </div>
  );
}
