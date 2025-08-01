'use client';

import { useTutorial } from '@/stores/useUIStore';

interface TutorialHighlightProps {
  stepId: string;
  children: React.ReactNode;
  className?: string;
}

const TutorialHighlight: React.FC<TutorialHighlightProps> = ({ 
  stepId, 
  children, 
  className = '' 
}) => {
  const tutorial = useTutorial();
  
  const currentStep = tutorial.steps[tutorial.currentStepIndex];
  const isCurrentStep = tutorial.isActive && currentStep?.id === stepId;
  const isCompleted = tutorial.steps.find(step => step.id === stepId)?.completed;

  if (!tutorial.isActive) {
    return <>{children}</>;
  }

  return (
    <div className={`relative ${className}`}>
      {isCurrentStep && (
        <>
          {/* Pulsing ring animation */}
          <div className="absolute inset-0 -m-1 rounded-xl border-2 border-orange-400 animate-pulse bg-orange-400/10 pointer-events-none z-10" />
          
          {/* Glowing effect */}
          <div className="absolute inset-0 -m-2 rounded-xl bg-orange-400/20 blur-sm pointer-events-none z-0" />
        </>
      )}
      
      {isCompleted && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center z-20">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
      )}
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default TutorialHighlight;