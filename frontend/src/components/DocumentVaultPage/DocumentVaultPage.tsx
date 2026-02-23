/**
 * Document Vault Page
 *
 * Unified content management page with 3 tabs:
 * - Dokumente: File upload, search, filter, folders
 * - Editor: Canvas (markdown/code editor with AI chat)
 * - Medien: Image/video gallery
 */

import { lazy, Suspense, memo } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { RisingBubbles } from '../RisingBubbles';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { DocumentsTab, DocumentVaultPageProps, DOC_TABS } from './types';
import { DocumentVaultContent } from './DocumentVaultContent';
import '../DocumentVaultPage.css';

const CanvasPage = lazy(() => import('../CanvasPage').then(m => ({ default: m.CanvasPage })));
const MediaGallery = lazy(() => import('../MediaGallery').then(m => ({ default: m.MediaGallery })));

function DocumentVaultPageComponent({ onBack, context, initialTab = 'documents' }: DocumentVaultPageProps) {
  const { activeTab: activeDocTab, handleTabChange: handleDocTabChange } = useTabNavigation<DocumentsTab>({
    initialTab,
    validTabs: DOC_TABS.map(t => t.id),
    defaultTab: 'documents',
    basePath: '/documents',
    rootTab: 'documents',
  });

  const backToDocuments = () => handleDocTabChange('documents');

  const renderDocTabs = () => (
    <div className="vault-doc-tabs" role="tablist" aria-label="Wissensbasis Navigation">
      {DOC_TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          role="tab"
          aria-selected={activeDocTab === tab.id}
          className={`vault-doc-tab ${activeDocTab === tab.id ? 'active' : ''}`}
          onClick={() => handleDocTabChange(tab.id)}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );

  if (activeDocTab === 'editor') {
    return (
      <div className="document-vault-page">
        <RisingBubbles variant="subtle" />
        {renderDocTabs()}
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <CanvasPage context={context} />
        </Suspense>
      </div>
    );
  }

  if (activeDocTab === 'media') {
    return (
      <div className="document-vault-page">
        <RisingBubbles variant="subtle" />
        {renderDocTabs()}
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <MediaGallery context={context} onBack={backToDocuments} />
        </Suspense>
      </div>
    );
  }

  // Documents tab - original DocumentVault content follows
  return <DocumentVaultContent onBack={onBack} context={context} activeDocTab={activeDocTab} onDocTabChange={handleDocTabChange} />;
}

export const DocumentVaultPage = memo(DocumentVaultPageComponent);
export default DocumentVaultPage;
