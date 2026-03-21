/**
 * useGuidedTour — Demo Mode Guided Tour Hook
 *
 * Manages tour state: active/inactive, current step, completion persistence.
 * Completion is persisted in localStorage so the tour only auto-starts once.
 */

import { useState, useCallback } from 'react';
import { TOUR_STEPS } from '../components/GuidedTour/tour-steps';

const STORAGE_KEY = 'zenai_tour_completed';

export interface GuidedTourState {
  isActive: boolean;
  isCompleted: boolean;
  currentStep: number;
  totalSteps: number;
  step: (typeof TOUR_STEPS)[number];
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
}

export function useGuidedTour(): GuidedTourState {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const isCompleted = localStorage.getItem(STORAGE_KEY) === 'true';

  const start = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const next = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setIsActive(false);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, [currentStep]);

  const back = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skip = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  return {
    isActive,
    isCompleted,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    step: TOUR_STEPS[currentStep],
    start,
    next,
    back,
    skip,
  };
}
