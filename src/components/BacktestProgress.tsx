import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface ProgressStep {
  id: number;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

interface BacktestProgressProps {
  currentStep: number;
  progress: number;
  statusMessage: string;
  steps: ProgressStep[];
}

export const BacktestProgress: React.FC<BacktestProgressProps> = ({
  currentStep,
  progress,
  statusMessage,
  steps,
}) => {
  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="space-y-6">
        {/* Step Indicators */}
        <div className="flex justify-between items-center mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex flex-col items-center flex-1">
              <div className="flex items-center w-full">
                {index > 0 && (
                  <div 
                    className={`flex-1 h-1 ${
                      step.status === 'completed' ? 'bg-green-500' : 
                      step.status === 'active' ? 'bg-blue-500' : 
                      'bg-gray-300'
                    }`} 
                  />
                )}
                <div className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2
                  ${step.status === 'completed' ? 'bg-green-500 border-green-500' :
                    step.status === 'active' ? 'bg-blue-500 border-blue-500' :
                    step.status === 'error' ? 'bg-red-500 border-red-500' :
                    'bg-gray-200 border-gray-300'}
                `}>
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : step.status === 'error' ? (
                    <Circle className="w-6 h-6 text-white" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div 
                    className={`flex-1 h-1 ${
                      steps[index + 1].status === 'completed' ? 'bg-green-500' : 
                      steps[index + 1].status === 'active' ? 'bg-blue-500' : 
                      'bg-gray-300'
                    }`} 
                  />
                )}
              </div>
              <div className="mt-2 text-center">
                <p className={`text-sm font-medium ${
                  step.status === 'active' ? 'text-blue-500' :
                  step.status === 'completed' ? 'text-green-500' :
                  step.status === 'error' ? 'text-red-500' :
                  'text-gray-500'
                }`}>
                  {step.title}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{statusMessage}</span>
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Additional Info */}
        <div className="text-center text-sm text-muted-foreground">
          {progress < 100 ? (
            <p>Please wait while we process your backtest...</p>
          ) : (
            <p className="text-green-500 font-medium">Processing complete! Loading results...</p>
          )}
        </div>
      </div>
    </Card>
  );
};
