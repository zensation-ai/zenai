import { GitBranch } from 'lucide-react';
import { EmptyState } from '../../design-system';

export function IdeaGraphView() {
  return (
    <div className="idea-graph-view" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState
        icon={<GitBranch size={48} />}
        title="Graph-Ansicht"
        description="Die visuelle Darstellung der Ideenverbindungen kommt bald."
      />
    </div>
  );
}
