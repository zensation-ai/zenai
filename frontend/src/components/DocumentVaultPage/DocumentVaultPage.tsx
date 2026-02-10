/**
 * Document Vault Page
 *
 * Unified content management page with 3 tabs:
 * - Dokumente: File upload, search, filter, folders
 * - Editor: Canvas (markdown/code editor with AI chat)
 * - Medien: Image/video gallery
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { SkeletonLoader } from '../SkeletonLoader';
import { DocumentsTab, DocumentVaultPageProps, DOC_TABS } from './types';
import { DocumentVaultContent } from './DocumentVaultContent';
import '../DocumentVaultPage.css';

const CanvasPage = lazy(() => import('../CanvasPage').then(m => ({ default: m.CanvasPage })));
const MediaGallery = lazy(() => import('../MediaGallery').then(m => ({ default: m.MediaGallery })));

export function DocumentVaultPage({ onBack, context, initialTab = 'documents' }: DocumentVaultPageProps) {
  const navigate = useNavigate();
  const [activeDocTab, setActiveDocTab] = useState<DocumentsTab>(initialTab);

  useEffect(() => {
    setActiveDocTab(initialTab || 'documents');
  }, [initialTab]);

  const handleDocTabChange = (tab: DocumentsTab) => {
    setActiveDocTab(tab);
    if (tab === 'documents') {
      navigate('/documents', { replace: true });
    } else {
      navigate(`/documents/${tab}`, { replace: true });
    }
  };

  const renderDocTabs = () => (
    <div className="vault-doc-tabs" role="tablist">
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
        {renderDocTabs()}
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <CanvasPage context={context} onNavigate={() => {}} />
        </Suspense>
      </div>
    );
  }

  if (activeDocTab === 'media') {
    return (
      <div className="document-vault-page">
        {renderDocTabs()}
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <MediaGallery context={context} onBack={() => handleDocTabChange('documents')} />
        </Suspense>
      </div>
    );
  }

  // Documents tab - original DocumentVault content follows
  return <DocumentVaultContent onBack={onBack} context={context} activeDocTab={activeDocTab} onDocTabChange={handleDocTabChange} />;
}

export default DocumentVaultPage;
