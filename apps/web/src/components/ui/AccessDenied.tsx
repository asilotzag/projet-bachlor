import { ShieldOff } from 'lucide-react';

export default function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-slate-400">
      <ShieldOff className="w-12 h-12 text-red-300" />
      <p className="text-lg font-semibold text-slate-600">Accès non autorisé</p>
      <p className="text-sm text-center max-w-xs">
        {message ?? "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource."}
      </p>
    </div>
  );
}
