import { Suspense, type ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePanelContext } from '../../contexts/PanelContext';
import { getPanelDefinition } from './panelRegistry';
import { PanelShell } from './PanelShell';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface PanelAreaProps {
  context: AIContext;
}

export function PanelArea({ context }: PanelAreaProps) {
  const { state, dispatch } = usePanelContext();
  const reduceMotion = useReducedMotion();

  const panel = state.activePanel ? getPanelDefinition(state.activePanel) : null;

  if (!panel) return null;

  const PanelContent = panel.component;

  return (
    <AnimatePresence mode="wait">
      {state.activePanel && (
        <motion.div
          key={state.activePanel}
          initial={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { width: state.width, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <PanelShell
            title={panel.label}
            icon={panel.icon as ComponentType<{ size?: number }>}
            pinned={state.pinned}
            onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
            onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })}
            width={state.width}
            onResize={(w) => dispatch({ type: 'SET_WIDTH', width: w })}
          >
            <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
              <PanelContent
                filter={state.filter}
                onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
                context={context}
              />
            </Suspense>
          </PanelShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
