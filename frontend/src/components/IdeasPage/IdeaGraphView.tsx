import { GitBranch } from 'lucide-react';
import { EmptyState } from '../../design-system';
import type { StructuredIdea } from '../../types';

interface IdeaGraphViewProps {
  ideas?: StructuredIdea[];
  onIdeaClick?: (idea: StructuredIdea) => void;
}

export function IdeaGraphView(_props: IdeaGraphViewProps) {
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
