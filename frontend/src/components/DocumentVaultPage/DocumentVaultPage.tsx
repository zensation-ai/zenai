/**
 * Document Vault Page
 *
 * Unified content management page with 3 tabs:
 * - Dokumente: File upload, search, filter, folders
 * - Editor: Canvas (markdown/code editor with AI chat)
 * - Medien: Image/video gallery
 *
 * Uses HubPage for unified layout.
 */

import { lazy, Suspense, memo } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { HubPage, type TabDef } from '../HubPage';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { DocumentsTab, DocumentVaultPageProps } from './types';
import { DocumentVaultContent } from './DocumentVaultContent';

const CanvasPage = lazy(() => import('../CanvasPage').then(m => ({ default: m.CanvasPage })));
const MediaGallery = lazy(() => import('../MediaGallery').then(m => ({ default: m.MediaGallery })));

const DOC_TABS: readonly TabDef<DocumentsTab>[] = [
  { id: 'documents', label: 'Dokumente', icon: '📄' },
  { id: 'editor', label: 'Editor', icon: '✏️' },
  { id: 'media', label: 'Medien', icon: '🖼️' },
];

const VALID_TABS = DOC_TABS.map(t => t.id);

function DocumentVaultPageComponent({ onBack, context, initialTab = 'documents' }: DocumentVaultPageProps) {
  const { activeTab: activeDocTab, handleTabChange: handleDocTabChange } = useTabNavigation<DocumentsTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'documents',
    basePath: '/documents',
    rootTab: 'documents',
  });

  return (
    <HubPage
      title="Wissensbasis"
      icon="📚"
      tabs={DOC_TABS}
      activeTab={activeDocTab}
      onTabChange={handleDocTabChange}
      onBack={onBack}
      context={context}
      ariaLabel="Wissensbasis Navigation"
    >
      {activeDocTab === 'documents' && (
        <DocumentVaultContent context={context} />
      )}

      {activeDocTab === 'editor' && (
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <CanvasPage context={context} />
        </Suspense>
      )}

      {activeDocTab === 'media' && (
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <MediaGallery context={context} onBack={() => handleDocTabChange('documents')} />
        </Suspense>
      )}
    </HubPage>
  );
}

export const DocumentVaultPage = memo(DocumentVaultPageComponent);
export default DocumentVaultPage;
