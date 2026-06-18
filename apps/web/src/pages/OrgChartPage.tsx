import { useQuery } from '@tanstack/react-query';
import { Users, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useState } from 'react';

interface OrgNode {
  id: string;
  name: string;
  role: string;
  position: string;
  department: string | null;
  managerId: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   'bg-red-100 text-red-700 border-red-200',
  RH:      'bg-blue-100 text-blue-700 border-blue-200',
  MANAGER: 'bg-amber-100 text-amber-700 border-amber-200',
  EMPLOYE: 'bg-green-100 text-green-700 border-green-200',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN:   'Administrateur',
  RH:      'Ressources Humaines',
  MANAGER: 'Manager',
  EMPLOYE: 'Employé',
};

function NodeCard({ node }: { node: OrgNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`border-2 rounded-xl px-4 py-3 bg-white shadow-sm text-center min-w-[140px] max-w-[160px] ${ROLE_COLORS[node.role] ?? 'bg-gray-100 border-gray-200'}`}>
        <div className="w-10 h-10 rounded-full bg-current/10 flex items-center justify-center mx-auto mb-2 text-lg font-bold">
          {node.name.charAt(0).toUpperCase()}
        </div>
        <p className="font-semibold text-sm leading-tight truncate" title={node.name}>{node.name}</p>
        <p className="text-xs mt-0.5 opacity-80 truncate" title={node.position}>{node.position}</p>
        {node.department && (
          <p className="text-[10px] mt-1 opacity-60 truncate">{node.department}</p>
        )}
        <span className={`inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[node.role] ?? ''}`}>
          {ROLE_LABELS[node.role] ?? node.role}
        </span>
      </div>
    </div>
  );
}

function OrgTreeNode({ node, allNodes, depth = 0 }: { node: OrgNode; allNodes: OrgNode[]; depth?: number }) {
  const children = allNodes.filter((n) => n.managerId === node.id);
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} />

      {children.length > 0 && (
        <>
          {/* Toggle + connector line */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center my-1 text-slate-500 transition"
            title={expanded ? 'Réduire' : 'Développer'}
          >
            <ChevronDown size={12} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>

          {expanded && (
            <div className="flex gap-4 relative">
              {/* Horizontal connector */}
              {children.length > 1 && (
                <div
                  className="absolute top-0 h-[1px] bg-slate-300"
                  style={{
                    left: `calc(50% / ${children.length})`,
                    right: `calc(50% / ${children.length})`,
                  }}
                />
              )}
              {children.map((child) => (
                <div key={child.id} className="flex flex-col items-center relative">
                  {/* Vertical connector */}
                  <div className="w-[1px] h-3 bg-slate-300" />
                  <OrgTreeNode node={child} allNodes={allNodes} depth={depth + 1} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [filterDept, setFilterDept] = useState('');

  const { data: nodes = [], isLoading } = useQuery<OrgNode[]>({
    queryKey: ['orgchart'],
    queryFn: () => api.get('/api/hr/orgchart').then((r) => r.data),
    staleTime: 60_000,
  });

  const departments = Array.from(new Set(nodes.map((n) => n.department).filter(Boolean))) as string[];

  const filtered = filterDept ? nodes.filter((n) => n.department === filterDept) : nodes;

  const filteredIds = new Set(filtered.map((n) => n.id));

  // Admin is the single root; all other nodes without a managerId become virtual children of Admin
  const adminNode = filtered.find((n) => n.role === 'ADMIN');
  const virtualAdminId = adminNode?.id ?? '__admin__';

  const augmented = filtered.map((n) => {
    // Already has a real manager in the list → keep as-is
    if (n.managerId && filteredIds.has(n.managerId)) return n;
    // Admin itself → root (no parent)
    if (n.role === 'ADMIN') return { ...n, managerId: null };
    // Everyone else with no manager → child of Admin
    return { ...n, managerId: virtualAdminId };
  });

  const roots = augmented.filter((n) => !n.managerId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Organigramme</h1>
          <p className="text-slate-500 text-sm mt-0.5">{nodes.length} collaborateur{nodes.length !== 1 ? 's' : ''} actif{nodes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="">Tous les départements</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <span key={role} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[role]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {label}
          </span>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p>Aucun collaborateur trouvé</p>
          </div>
        ) : (
          <div className="flex gap-12 justify-center min-w-max pb-4">
            {roots.map((root) => (
              <OrgTreeNode key={root.id} node={root} allNodes={augmented} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
