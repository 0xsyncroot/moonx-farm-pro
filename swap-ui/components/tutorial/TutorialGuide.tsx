'use client';

import { useEffect, useState } from 'react';
import { useTutorial, useTutorialActions } from '@/stores/useUIStore';
import { useWalletState, useTokenState } from '@/stores';
import TutorialOverlay from './TutorialOverlay';

const TUTORIAL_STORAGE_KEY = 'moonx-tutorial-completed';
const TUTORIAL_PROGRESS_KEY = 'moonx-tutorial-progress';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  selector: string;
  waitForElement?: boolean;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'connect-wallet',
    title: 'Connect Your Wallet',
    description: 'Click here to connect your wallet using private key mode for secure access to DeFi features.',
    selector: '[data-tutorial="connect-wallet"]',
    waitForElement: true,
  },
  {
    id: 'add-funds',
    title: 'Add Funds to Trade',
    description: 'This shows your token balance. You need tokens in your wallet to start trading. Send tokens from an exchange or another wallet.',
    selector: '[data-tutorial="token-balance"]',
    waitForElement: true,
  },
  {
    id: 'first-swap',
    title: 'Make Your First Swap',
    description: 'Click here to execute your first token swap. Make sure you have selected tokens and entered an amount.',
    selector: '[data-tutorial="swap-button"]',
    waitForElement: true,
  },
];

interface TutorialProgress {
  currentStepIndex: number;
  completedSteps: string[];
  skippedSteps: string[];
}

interface TutorialGuideProps {
  children: React.ReactNode;
}

const TutorialGuide: React.FC<TutorialGuideProps> = ({ children }) => {
  const tutorial = useTutorial();
  const { 
    startTutorial, 
    nextTutorialStep, 
    skipTutorialStep, 
    endTutorial, 
    setFirstTimeUser, 
    completeTutorialStep,
    setTutorialStepIndex 
  } = useTutorialActions();
  const { isConnected, walletAddress } = useWalletState();
  const { tokens } = useTokenState();
  
  const [isWaitingForElement, setIsWaitingForElement] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Load tutorial progress from localStorage
  const loadTutorialProgress = (): TutorialProgress => {
    try {
      const saved = localStorage.getItem(TUTORIAL_PROGRESS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load tutorial progress:', error);
    }
    
    return {
      currentStepIndex: 0,
      completedSteps: [],
      skippedSteps: [],
    };
  };

  // Save tutorial progress to localStorage
  const saveTutorialProgress = (progress: TutorialProgress) => {
    try {
      localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
    } catch (error) {
      console.warn('Failed to save tutorial progress:', error);
    }
  };

  // Initialize tutorial on first load
  useEffect(() => {
    if (hasInitialized) return;

    const hasCompletedTutorial = localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
    
    if (!hasCompletedTutorial) {
      const progress = loadTutorialProgress();
      
      // Check if we have any completed or skipped steps - resume from there
      if (progress.completedSteps.length > 0 || progress.skippedSteps.length > 0) {
        setFirstTimeUser(false); // Not truly first time, resuming
        
        // Find next uncompleted/unskipped step
        let nextStepIndex = 0;
        for (let i = 0; i < tutorialSteps.length; i++) {
          const stepId = tutorialSteps[i].id;
          if (!progress.completedSteps.includes(stepId) && !progress.skippedSteps.includes(stepId)) {
            nextStepIndex = i;
            break;
          }
          nextStepIndex = i + 1; // All previous steps done
        }
        
        if (nextStepIndex < tutorialSteps.length) {
          // Still have steps to complete
          startTutorial();
          // Set the correct step index in store
          setTutorialStepIndex(nextStepIndex);
          progress.currentStepIndex = nextStepIndex;
          saveTutorialProgress(progress);
        }
      } else {
        // Truly first time user
        setFirstTimeUser(true);
        setTimeout(() => {
          startTutorial();
        }, 2000);
      }
    } else {
      setFirstTimeUser(false);
    }
    
    setHasInitialized(true);
  }, [hasInitialized, startTutorial, setFirstTimeUser, setTutorialStepIndex]);

  // Auto-complete steps based on user actions
  useEffect(() => {
    if (!tutorial.isActive || !hasInitialized) return;

    const currentStep = tutorialSteps[tutorial.currentStepIndex];
    if (!currentStep) return;

    // Complete connect-wallet step when user connects
    if (currentStep.id === 'connect-wallet' && isConnected && walletAddress) {
      const tutorialStep = tutorial.steps.find(step => step.id === 'connect-wallet');
      if (tutorialStep && !tutorialStep.completed && !tutorialStep.skipped) {
        completeTutorialStep('connect-wallet');
        
        // Save progress and move to next step
        const progress = loadTutorialProgress();
        if (!progress.completedSteps.includes('connect-wallet')) {
          progress.completedSteps.push('connect-wallet');
          progress.currentStepIndex = tutorial.currentStepIndex + 1;
          saveTutorialProgress(progress);
        }
        
        setTimeout(() => {
          handleNext();
        }, 1500);
      }
    }

    // Complete add-funds step when user has tokens with balance
    if (currentStep.id === 'add-funds' && isConnected && tokens.length > 0) {
      // Check if user has any token with balance > 0
      const hasBalance = tokens.some(token => 
        parseFloat(token.formattedBalance || '0') > 0
      );
      
      if (hasBalance) {
        const tutorialStep = tutorial.steps.find(step => step.id === 'add-funds');
        if (tutorialStep && !tutorialStep.completed && !tutorialStep.skipped) {
          completeTutorialStep('add-funds');
          
          // Save progress and move to next step
          const progress = loadTutorialProgress();
          if (!progress.completedSteps.includes('add-funds')) {
            progress.completedSteps.push('add-funds');
            progress.currentStepIndex = tutorial.currentStepIndex + 1;
            saveTutorialProgress(progress);
          }
          
          setTimeout(() => {
            handleNext();
          }, 1500);
        }
      }
    }
  }, [tutorial.isActive, tutorial.currentStepIndex, isConnected, walletAddress, tokens, hasInitialized, completeTutorialStep]);

  // Listen for successful swap completion (add this to SwapContainer when swap completes)
  useEffect(() => {
    if (!tutorial.isActive || !hasInitialized) return;

    const currentStep = tutorialSteps[tutorial.currentStepIndex];
    if (!currentStep || currentStep.id !== 'first-swap') return;

    // Check for swap completion event via localStorage or store
    const handleSwapCompletion = () => {
      const tutorialStep = tutorial.steps.find(step => step.id === 'first-swap');
      if (tutorialStep && !tutorialStep.completed && !tutorialStep.skipped) {
        completeTutorialStep('first-swap');
        
        const progress = loadTutorialProgress();
        if (!progress.completedSteps.includes('first-swap')) {
          progress.completedSteps.push('first-swap');
          saveTutorialProgress(progress);
        }
        
        setTimeout(() => {
          handleNext(); // This will end the tutorial
        }, 2000);
      }
    };

    // Listen for custom event dispatched from SwapContainer
    window.addEventListener('tutorial-swap-completed', handleSwapCompletion);
    
    return () => {
      window.removeEventListener('tutorial-swap-completed', handleSwapCompletion);
    };
  }, [tutorial.isActive, tutorial.currentStepIndex, hasInitialized, completeTutorialStep]);

  // Wait for element to appear in DOM
  useEffect(() => {
    if (!tutorial.isActive || !hasInitialized) return;

    const currentStep = tutorialSteps[tutorial.currentStepIndex];
    if (!currentStep?.waitForElement) {
      setIsWaitingForElement(false);
      return;
    }

    setIsWaitingForElement(true);
    
    const checkElement = () => {
      const element = document.querySelector(currentStep.selector);
      if (element) {
        setIsWaitingForElement(false);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkElement()) return;

    // Keep checking until element appears
    const interval = setInterval(() => {
      if (checkElement()) {
        clearInterval(interval);
      }
    }, 500);

    // Timeout after 15 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setIsWaitingForElement(false);
    }, 15000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [tutorial.isActive, tutorial.currentStepIndex, hasInitialized]);

  const handleNext = () => {
    const currentStep = tutorialSteps[tutorial.currentStepIndex];
    if (!currentStep) return;

    // Save progress - mark current step as completed
    const progress = loadTutorialProgress();
    if (!progress.completedSteps.includes(currentStep.id)) {
      progress.completedSteps.push(currentStep.id);
      progress.currentStepIndex = tutorial.currentStepIndex + 1;
      saveTutorialProgress(progress);
    }

    if (tutorial.currentStepIndex === tutorialSteps.length - 1) {
      // Last step - end tutorial
      endTutorial();
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      localStorage.removeItem(TUTORIAL_PROGRESS_KEY); // Clean up progress
    } else {
      // Move to next step
      nextTutorialStep();
    }
  };

  const handleSkip = () => {
    const currentStep = tutorialSteps[tutorial.currentStepIndex];
    const tutorialStep = tutorial.steps.find(step => step.id === currentStep?.id);
    
    if (!currentStep) return;

    // Save progress - mark current step as skipped
    const progress = loadTutorialProgress();
    if (!progress.skippedSteps.includes(currentStep.id)) {
      progress.skippedSteps.push(currentStep.id);
      progress.currentStepIndex = tutorial.currentStepIndex + 1;
      saveTutorialProgress(progress);
    }
    
    if (tutorialStep?.required) {
      // Required step - end tutorial
      endTutorial();
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
    } else {
      // Optional step - skip to next
      skipTutorialStep();
      if (tutorial.currentStepIndex === tutorialSteps.length - 1) {
        endTutorial();
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
        localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
      } else {
        nextTutorialStep();
      }
    }
  };

  const handleClose = () => {
    endTutorial();
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
  };

  const currentStep = tutorialSteps[tutorial.currentStepIndex];
  const tutorialStep = tutorial.steps.find(step => step.id === currentStep?.id);
  const isActive = tutorial.isActive && !isWaitingForElement && currentStep && hasInitialized;

  // Debug logs
  console.log('🔍 Tutorial Debug:', {
    'tutorial.isActive': tutorial.isActive,
    'isWaitingForElement': isWaitingForElement,
    'currentStep': currentStep?.id,
    'hasInitialized': hasInitialized,
    'tutorial.currentStepIndex': tutorial.currentStepIndex,
    'isActive': isActive,
    'hasCompletedTutorial': localStorage.getItem(TUTORIAL_STORAGE_KEY),
    'progress': loadTutorialProgress()
  });

  return (
    <>
      {children}
      {isActive && (
        <TutorialOverlay
          isActive={true}
          targetSelector={currentStep.selector}
          title={currentStep.title}
          description={currentStep.description}
          onNext={handleNext}
          onSkip={handleSkip}
          onClose={handleClose}
          showSkip={!tutorialStep?.required}
          isLastStep={tutorial.currentStepIndex === tutorialSteps.length - 1}
          stepNumber={tutorial.currentStepIndex + 1}
          totalSteps={tutorialSteps.length}
        />
      )}
    </>
  );
};

export default TutorialGuide;