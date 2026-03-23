import { Suspense, type ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePanelContext } from '../../contexts/PanelContext';
import { getPanelDefinition } from './panelRegistry';
import { PanelShell } from './PanelShell';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface PanelAreaProps {
  context: AIContext;
  isMobile?: boolean;
}

const BOTTOM_BAR_HEIGHT = 56;

export function PanelArea({ context, isMobile }: PanelAreaProps) {
  const { state, dispatch } = usePanelContext();
  const reduceMotion = useReducedMotion();

  const panel = state.activePanel ? getPanelDefinition(state.activePanel) : null;

  if (!panel) return null;

  const PanelContent = panel.component;
  const closePanel = () => dispatch({ type: 'CLOSE_PANEL' });

  if (isMobile) {
    return (
      <AnimatePresence mode="wait">
        {state.activePanel && (
          <>
            {/* Backdrop */}
            <motion.div
              className="panel-area-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closePanel}
              aria-hidden="true"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 90,
              }}
            />
            {/* Bottom sheet */}
            <motion.div
              key={state.activePanel}
              className="panel-area-mobile"
              initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
              animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'fixed',
                bottom: BOTTOM_BAR_HEIGHT,
                left: 0,
                right: 0,
                height: `calc(100dvh - ${BOTTOM_BAR_HEIGHT}px)`,
                zIndex: 95,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Drag handle */}
              <div
                className="panel-area-mobile__handle"
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: 28,
                  flexShrink: 0,
                  background: 'rgba(15, 23, 42, 0.98)',
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  cursor: 'grab',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255, 255, 255, 0.2)',
                  }}
                />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <PanelShell
                  title={panel.label}
                  icon={panel.icon as ComponentType<{ size?: number }>}
                  pinned={state.pinned}
                  onClose={closePanel}
                  onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })}
                  width={window.innerWidth}
                  onResize={() => {/* no-op on mobile */}}
                >
                  <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
                    <PanelContent
                      filter={state.filter}
                      onClose={closePanel}
                      context={context}
                    />
                  </Suspense>
                </PanelShell>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {state.activePanel && (
        <motion.div
          key={state.activePanel}
          initial={{ width: state.width, opacity: 1 }}
          animate={{ width: state.width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <PanelShell
            title={panel.label}
            icon={panel.icon as ComponentType<{ size?: number }>}
            pinned={state.pinned}
            onClose={closePanel}
            onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })}
            width={state.width}
            onResize={(w) => dispatch({ type: 'SET_WIDTH', width: w })}
          >
            <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
              <PanelContent
                filter={state.filter}
                onClose={closePanel}
                context={context}
              />
            </Suspense>
          </PanelShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
