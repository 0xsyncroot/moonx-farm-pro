'use client';

import { useEffect, useState } from 'react';
import { useTutorial, useTutorialActions } from '@/stores/useUIStore';
import { useWalletState } from '@/stores';
import TutorialModal from './TutorialModal';

const TUTORIAL_STORAGE_KEY = 'moonx-tutorial-completed';

interface TutorialProviderProps {
  children: React.ReactNode;
}

const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const tutorial = useTutorial();
  const { startTutorial, endTutorial, setFirstTimeUser, completeTutorialStep } = useTutorialActions();
  const { isConnected, walletAddress } = useWalletState();
  const [showTutorial, setShowTutorial] = useState(false);

  // Check if user has completed tutorial before
  useEffect(() => {
    const hasCompletedTutorial = localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
    
    if (!hasCompletedTutorial) {
      // First time user - show tutorial after short delay
      setFirstTimeUser(true);
      const timer = setTimeout(() => {
        startTutorial();
        setShowTutorial(true);
      }, 1500); // Give time for app to load
      
      return () => clearTimeout(timer);
    } else {
      setFirstTimeUser(false);
    }
  }, [startTutorial, setFirstTimeUser]);

  // Track tutorial state changes
  useEffect(() => {
    if (tutorial.isActive) {
      setShowTutorial(true);
    } else {
      setShowTutorial(false);
      // Mark tutorial as completed in localStorage
      if (tutorial.isFirstTime) {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      }
    }
  }, [tutorial.isActive, tutorial.isFirstTime]);

  // Auto-complete steps based on user actions
  useEffect(() => {
    if (isConnected && walletAddress && tutorial.isActive) {
      const connectStep = tutorial.steps.find(step => step.id === 'connect-wallet');
      if (connectStep && !connectStep.completed && !connectStep.skipped) {
        completeTutorialStep('connect-wallet');
      }
    }
  }, [isConnected, walletAddress, tutorial.isActive, tutorial.steps, completeTutorialStep]);

  const handleCloseTutorial = () => {
    endTutorial();
    setShowTutorial(false);
  };

  return (
    <>
      {children}
      <TutorialModal 
        isOpen={showTutorial && tutorial.isActive}
        onClose={handleCloseTutorial}
      />
    </>
  );
};

export default TutorialProvider;