import { GitBranch } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { StructuredIdea } from '../../types';

interface IdeaGraphViewProps {
  ideas?: StructuredIdea[];
  onIdeaClick?: (idea: StructuredIdea) => void;
}

export function IdeaGraphView(_props: IdeaGraphViewProps) {
  return (
    <div className="idea-graph-view flex flex-1 items-center justify-center">
      <EmptyState
        icon={<GitBranch size={48} />}
        title="Graph-Ansicht"
        description="Die visuelle Darstellung der Ideenverbindungen kommt bald."
      />
    </div>
  );
}
