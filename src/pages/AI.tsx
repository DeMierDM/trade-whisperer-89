import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, MessageSquare, Code, TrendingUp, Terminal } from "lucide-react";
import ModernClaudeChat from '../components/ModernClaudeChat';

const AI = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">AI Assistant (Claude Chat)</h1>
          <p className="text-muted-foreground">Interactive chat with Claude AI - supporting code changes, interactive prompts, and clipboard operations</p>
        </div>

        {/* Claude AI Chat Interface - Full Width */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div className="h-[700px]">
            <ModernClaudeChat className="h-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chat Status */}
          <Card className="p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Chat Status
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm font-medium">Claude Chat</span>
                <Badge variant="outline" className="bg-success/10 text-success border-success">
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm font-medium">WebSocket Port</span>
                <span className="font-medium font-mono">8081</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm font-medium">Interactive Mode</span>
                <Badge variant="outline" className="bg-success/10 text-success border-success">
                  Enabled
                </Badge>
              </div>
            </div>
          </Card>

          {/* Claude Capabilities */}
          <Card className="col-span-2 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-primary" />
              Claude Capabilities
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: "Code Analysis", desc: "Analyze and review your trading code", icon: Code },
                { name: "Strategy Development", desc: "Create new trading strategies", icon: TrendingUp },
                { name: "Bug Fixing", desc: "Debug and fix code issues", icon: Code },
                { name: "Performance Optimization", desc: "Optimize code performance", icon: TrendingUp },
                { name: "File Operations", desc: "Read, write, and modify files", icon: Code },
                { name: "Terminal Commands", desc: "Execute system commands", icon: Terminal },
                { name: "Data Analysis", desc: "Analyze trading data and metrics", icon: Brain },
                { name: "Documentation", desc: "Generate code documentation", icon: Code },
              ].map((capability) => (
                <div key={capability.name} className="p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <capability.icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{capability.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{capability.desc}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Chat Session History */}
          <Card className="col-span-3 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Recent Chat Interactions
            </h2>
            <div className="space-y-2">
              {[
                { message: "Analyze my backtesting performance", response: "Generated detailed performance report with suggestions", time: "2 min ago", type: "analysis" },
                { message: "Help me debug the options data issue", response: "Identified WebSocket connection issue and provided fix", time: "5 min ago", type: "debug" },
                { message: "Review my trading strategy code", response: "Suggested 3 improvements for better performance", time: "8 min ago", type: "review" },
                { message: "Create a new momentum strategy", response: "Generated complete strategy with backtesting setup", time: "15 min ago", type: "creation" },
              ].map((session, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <Badge variant="outline" className="text-xs">
                        {session.type}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{session.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">💬 {session.message}</p>
                  <p className="text-xs font-medium text-success">🤖 {session.response}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Chat Message Examples */}
          <Card className="col-span-3 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4">Example Chat Messages</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "Analyze strategy performance", message: "Analyze my backtesting results and suggest improvements" },
                { label: "Debug trading issue", message: "Help me debug why my bot isn't receiving options data" },
                { label: "Review code quality", message: "Review the BusClient.js file for potential improvements" },
                { label: "Generate new strategy", message: "Create a momentum-based options strategy" },
                { label: "Optimize performance", message: "How can I optimize my WebSocket data processing?" },
                { label: "Fix UI issues", message: "The charts aren't updating properly, can you help?" },
              ].map((example) => (
                <div key={example.label} className="p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                  <p className="text-sm font-medium mb-2">{example.label}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-400">💬</span>
                    <p className="text-xs text-muted-foreground">{example.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AI;
