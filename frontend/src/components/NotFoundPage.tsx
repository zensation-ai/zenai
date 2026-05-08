import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <EmptyState
        icon={<Search size={48} />}
        title="Seite nicht gefunden"
        description="Die angeforderte Seite existiert nicht oder wurde verschoben."
        action={
          <Button variant="default" onClick={() => navigate('/')}>
            Zur Startseite
          </Button>
        }
      />
    </div>
  );
}
