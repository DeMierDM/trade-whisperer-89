import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import './ClaudeChat.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  MessageCircle, 
  Send, 
  Copy, 
  Check, 
  X, 
  RefreshCw, 
  Code, 
  Terminal,
  Bot,
  User,
  Loader2,
  ChevronDown,
  FileText,
  Brain,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'thinking' | 'error' | 'usage-warning';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  isStreaming?: boolean;
  metadata?: {
    isPartial?: boolean;
    thinkingStage?: string;
    usageLevel?: 'normal' | 'warning' | 'critical';
  };
}

interface ClaudeChatProps {
  className?: string;
}

const ClaudeChat: React.FC<ClaudeChatProps> = ({ className = '' }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [claudeReady, setClaudeReady] = useState(false);
  const [terminalBuffer, setTerminalBuffer] = useState<string>('');
  const [usageStatus, setUsageStatus] = useState<'normal' | 'warning' | 'limited'>('normal');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize Claude connection
  const connectToClaude = useCallback(() => {
    setIsConnecting(true);
    
    try {
      const newSocket = io('http://localhost:8081', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to Claude AI');
        setIsConnected(true);
        setIsConnecting(false);
        
        // Create new terminal session for Claude
        newSocket.emit('create-terminal', {
          sessionId: 'claude-persistent-main'
        });

        addSystemMessage('🤖 Connected to Claude AI - Ready for conversation!');
      });

      newSocket.on('terminal-created', (data: { terminalId: string }) => {
        setTerminalId(data.terminalId);
        console.log('Terminal created:', data.terminalId);
        
        addSystemMessage('🔄 Starting Claude AI...');
        
        // Start Claude CLI immediately and properly
        setTimeout(() => {
          // Clear terminal first
          newSocket.emit('terminal-input', {
            terminalId: data.terminalId,
            input: 'clear\n'
          });
          
          // Start Claude CLI
          setTimeout(() => {
            newSocket.emit('terminal-input', {
              terminalId: data.terminalId,
              input: '/root/.local/bin/claude\n'
            });
          }, 500);
        }, 1000);
      });

      newSocket.on('terminal-output', (data: { terminalId: string; data: string }) => {
        processClaudeOutput(data.data);
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        addSystemMessage('❌ Disconnected from Claude AI');
      });

      newSocket.on('error', (error: any) => {
        console.error('Socket error:', error);
        addSystemMessage(`❌ Connection error: ${error.message}`);
      });

      // Listen for Claude usage status events
      newSocket.on('claude-usage-status', (data: { status: string; message: string; timestamp: number }) => {
        console.log('📊 Usage status received:', data);
        if (data.status === 'warning') {
          setUsageStatus('warning');
          addSystemMessage(`🚨 USAGE LIMIT WARNING: ${data.message}`);
        }
      });

      newSocket.on('claude-usage-warning', (data: { message: string; type: string }) => {
        console.log('⚠️ Usage warning received:', data);
        setUsageStatus('warning');
        addSystemMessage(`🚨 CLAUDE USAGE WARNING: ${data.message}`);
      });

      setSocket(newSocket);

    } catch (error) {
      console.error('Failed to connect:', error);
      setIsConnecting(false);
      addSystemMessage('❌ Failed to connect to Claude AI');
    }
  }, []);

  useEffect(() => {
    connectToClaude();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [connectToClaude]);

  // Process Claude CLI output and convert to chat messages
  const processClaudeOutput = (output: string) => {
    // Add to terminal buffer for processing
    setTerminalBuffer(prev => {
      const newBuffer = prev + output;
      
      // Clean output by removing ANSI codes and control characters
      const cleanOutput = output
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .replace(/\x1b\[[A-Za-z]/g, '') // Remove ANSI cursor codes
        .replace(/\x1b\[[\d;]*[A-Za-z]/g, '') // Remove all ANSI escape sequences
        .replace(/\r/g, '') // Remove carriage returns
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control chars
        .trim();

      // Only process substantial Claude responses
      if (cleanOutput.length > 0) {
        processClaudeResponse(cleanOutput);
      }
      
      return newBuffer;
    });
  };

  // Separate function to process actual Claude responses
  const processClaudeResponse = (cleanOutput: string) => {
    if (!cleanOutput || cleanOutput.trim().length === 0) return;

    // Very minimal filtering - only filter the most obvious terminal noise
    // Let Claude responses through even if they look like commands
    const isJustShellPrompt = /^(root@\w+:|[\$#])\s*$/.test(cleanOutput.trim());
    const isJustCommand = /^(clear|claude|exit)\s*$/.test(cleanOutput.trim());
    
    // Skip only if it's clearly just a shell prompt or basic command with no output
    if (isJustShellPrompt || isJustCommand) {
      console.log('🚫 Filtering shell noise:', cleanOutput);
      return;
    }

    // Log what we're processing for debugging
    console.log('🤖 Processing Claude output:', cleanOutput);

    // Detect when Claude is ready and responding
    const claudeReadyIndicators = [
      /I'm Claude/i,
      /Hello.*I'm an AI assistant/i,
      /How can I help you/i,
      /I'm an AI assistant/i,
      /What would you like to/i,
      /I'd be happy to help/i,
      /Claude Code/i,
      /Sonnet.*Claude Pro/i,
      /\/workspace/,
    ];

    const isClaudeGreeting = claudeReadyIndicators.some(pattern => pattern.test(cleanOutput));
    
    // Handle Claude's startup interface and check for usage limits
    if (cleanOutput.includes('Claude Code') && cleanOutput.includes('Sonnet') && cleanOutput.includes('/workspace')) {
      if (!claudeReady) {
        setClaudeReady(true);
        addSystemMessage('✅ Claude AI is ready! You can start chatting.');
        // Show Claude's welcome interface as a system message
        addSystemMessage('🤖 Claude Code v2.0.37 - Sonnet 4.5 · Claude Pro');
        
        // Check for usage limit warnings in the same output
        if (cleanOutput.includes('Approaching weekly limit') || cleanOutput.includes('weekly limit')) {
          setUsageStatus('warning');
          addSystemMessage('🚨 WARNING: Approaching weekly usage limit!');
        }
        return;
      }
    }
    
    // Check for usage limit messages anywhere in the output
    if (cleanOutput.includes('Approaching weekly limit') || cleanOutput.includes('weekly limit') || 
        cleanOutput.includes('usage limit') || cleanOutput.includes('rate limit')) {
      setUsageStatus('warning');
      addSystemMessage(`🚨 USAGE LIMIT: ${cleanOutput}`);
      return;
    }
    
    if (isClaudeGreeting && !claudeReady) {
      setClaudeReady(true);
      addSystemMessage('✅ Claude AI is ready! You can start chatting.');
      addAssistantMessage(cleanOutput);
      return;
    }

    // Skip very short outputs (likely partial responses)
    if (cleanOutput.length < 3) return;

    // Special handling for Claude thinking/processing state
    if (cleanOutput.includes('Thinking on') || cleanOutput.includes('tab to toggle')) {
      addSystemMessage('🤔 Claude is thinking...');
      return;
    }

    // Show ALL substantial content that made it past the noise filter
    // This ensures users see Claude's responses including errors, limits, etc.
    console.log('📝 Displaying Claude output:', cleanOutput.substring(0, 100) + '...');
    
    // Add as assistant message - show everything Claude says
    addAssistantMessage(cleanOutput);
    
    // Also handle special interactive cases
    if (cleanOutput.includes('Do you want to') || cleanOutput.includes('Would you like to') || 
        cleanOutput.includes('Should I') || cleanOutput.includes('Proceed with')) {
      addInteractivePrompt(cleanOutput, 'yes-no');
    }
  };

  // Helper function to determine if output is actually from Claude
  const isActualClaudeResponse = (text: string): boolean => {
    // Must be substantial
    if (text.length < 15) return false;
    
    // Skip obvious system/terminal output
    const systemPatterns = [
      /^\s*[\$#>]\s/, // Command prompts
      /^\s*\d+\s*$/, // Just numbers
      /^[^\w\s]*$/, // Only symbols/punctuation
      /^(clear|ls|cd|pwd|exit|node|npm|yarn)\s*$/i, // Commands
      /^\s*(Welcome|Linux|Ubuntu|root@|Error|Warning)/i,
      /^\/[a-z\/]+/, // File paths
      /\[[0-9]{1,2}m/, // ANSI codes that weren't cleaned
      /^Authenticat/i,
      /^Connect/i,
      /^Install/i,
    ];
    
    if (systemPatterns.some(pattern => pattern.test(text))) {
      return false;
    }
    
    // Claude responses typically have:
    // - Natural language with proper grammar
    // - Complete sentences or thoughtful fragments
    // - Conversational tone
    const claudeIndicators = [
      /^(I|Here|Let me|To|This|That|You|We|It)/i, // Common sentence starters
      /[.!?]$/, // Proper sentence endings
      /\b(help|assist|can|will|would|could|should|let me)\b/i, // Helpful language
      /\b(I'm|I'll|I'd|you're|you'll|you'd|we're|we'll)\b/i, // Contractions
    ];
    
    const hasClaudeIndicators = claudeIndicators.some(pattern => pattern.test(text));
    const hasLetters = /[a-zA-Z]{3,}/.test(text); // At least 3 consecutive letters
    const hasSpaces = /\s/.test(text); // Contains spaces (natural language)
    
    return hasClaudeIndicators && hasLetters && hasSpaces;
  };

  // Extract choices from Claude output
  const extractChoices = (output: string): string[] => {
    const lines = output.split('\n');
    const choices: string[] = [];
    
    for (const line of lines) {
      const match = line.match(/^\s*[\d\)\.]?\s*(.+)$/);
      if (match && match[1]) {
        choices.push(match[1].trim());
      }
    }
    
    return choices.length > 0 ? choices : ['Yes', 'No'];
  };

  // Add different types of messages
  const addSystemMessage = (content: string) => {
    const message: Message = {
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const addUserMessage = (content: string) => {
    const message: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date(),
      status: 'sending'
    };
    setMessages(prev => [...prev, message]);
    
    // Send to Claude
    if (socket && terminalId) {
      socket.emit('terminal-input', {
        terminalId,
        input: content + '\n'
      });
      
      // Update status to sent
      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.id === message.id 
            ? { ...msg, status: 'sent' as const }
            : msg
        ));
      }, 500);
    }
  };

  const addAssistantMessage = (content: string) => {
    setIsTyping(true);
    
    setTimeout(() => {
      const message: Message = {
        id: `assistant-${Date.now()}`,
        type: 'assistant',
        content,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, message]);
      setIsTyping(false);
    }, 300);
  };

  const addInteractivePrompt = (content: string, promptType: 'yes-no' | 'choice', choices?: string[]) => {
    const message: Message = {
      id: `prompt-${Date.now()}`,
      type: 'interactive-prompt',
      content,
      timestamp: new Date(),
      metadata: {
        promptType,
        choices: choices || ['Yes', 'No'],
        pending: true
      }
    };
    setMessages(prev => [...prev, message]);
  };

  const addCodeChangeMessage = (content: string) => {
    const message: Message = {
      id: `code-${Date.now()}`,
      type: 'code-change',
      content,
      timestamp: new Date(),
      metadata: {
        isCodeChange: true,
        files: extractFileNames(content),
        pending: true
      }
    };
    setMessages(prev => [...prev, message]);
  };

  // Extract file names from code change content
  const extractFileNames = (content: string): string[] => {
    const fileRegex = /([a-zA-Z0-9_-]+\.(js|ts|tsx|jsx|py|java|cpp|h|css|html|md|json|yml|yaml))/g;
    const matches = content.match(fileRegex);
    return matches ? [...new Set(matches)] : [];
  };

  // Handle sending messages
  const sendMessage = () => {
    if (!currentInput.trim() || !isConnected || !claudeReady) return;
    
    addUserMessage(currentInput.trim());
    setCurrentInput('');
    inputRef.current?.focus();
  };

  // Handle interactive responses
  const handleInteractiveResponse = (messageId: string, response: string) => {
    // Update the message to show it's no longer pending
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, metadata: { ...msg.metadata, pending: false } }
        : msg
    ));

    // Send response to Claude
    addUserMessage(response);
  };

  // Handle code change approval/rejection
  const handleCodeChangeResponse = (messageId: string, approved: boolean) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, metadata: { ...msg.metadata, pending: false } }
        : msg
    ));

    const response = approved ? 'yes' : 'no';
    addUserMessage(response);
  };

  // Copy message content
  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      // Could add a toast notification here
    });
  };

  // Handle paste
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setCurrentInput(prev => prev + text);
      }
    } catch (err) {
      console.warn('Failed to read clipboard:', err);
    }
  }, []);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      handlePaste();
    }
  };

  // Render message based on type
  const renderMessage = (message: Message) => {
    switch (message.type) {
      case 'user':
        return (
          <div key={message.id} className="flex justify-end mb-6">
            <div className="flex items-start space-x-3 max-w-[85%]">
              <div className="bg-blue-600 text-white rounded-3xl rounded-tr-lg px-5 py-3 shadow-sm">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <div className="flex items-center justify-end space-x-2 mt-2">
                  <span className="text-xs opacity-80">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {message.status === 'sending' && <Loader2 className="h-3 w-3 animate-spin opacity-80" />}
                  {message.status === 'sent' && <Check className="h-3 w-3 opacity-80" />}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
        );

      case 'assistant':
        return (
          <div key={message.id} className="flex justify-start mb-6">
            <div className="flex items-start space-x-3 max-w-[90%]">
              <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-3xl rounded-tl-lg px-5 py-4 relative group shadow-sm">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">{message.content}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-500">
                    Claude • {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 h-7 px-2 hover:bg-gray-200 rounded-lg transition-all"
                    onClick={() => copyMessage(message.content)}
                  >
                    <Copy className="h-3 w-3 text-gray-600" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'interactive-prompt':
        return (
          <div key={message.id} className="flex justify-start mb-6">
            <div className="flex items-start space-x-3 max-w-[90%]">
              <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-3xl rounded-tl-lg px-5 py-4 shadow-sm">
                <p className="text-sm leading-relaxed whitespace-pre-wrap mb-4 text-amber-900">{message.content}</p>
                {message.metadata?.pending && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {message.metadata.choices?.map((choice, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="h-9 px-4 bg-white hover:bg-amber-100 border-amber-300 text-amber-800 hover:text-amber-900 rounded-full transition-all"
                        onClick={() => handleInteractiveResponse(message.id, choice)}
                      >
                        {choice}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="text-xs text-amber-600">
                  Claude • {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>
        );

      case 'code-change':
        return (
          <div key={message.id} className="flex justify-start mb-4">
            <div className="flex items-start space-x-2 max-w-[90%]">
              <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                <Code className="h-4 w-4 text-white" />
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex items-center space-x-2 mb-2">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700">Code Changes Proposed</span>
                </div>
                {message.metadata?.files && message.metadata.files.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {message.metadata.files.map((file, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {file}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs whitespace-pre-wrap mb-3 font-mono bg-white p-2 rounded">
                  {message.content}
                </p>
                {message.metadata?.pending && (
                  <div className="flex space-x-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 bg-green-600 hover:bg-green-700"
                      onClick={() => handleCodeChangeResponse(message.id, true)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handleCodeChangeResponse(message.id, false)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        );

      case 'system':
        return (
          <div key={message.id} className="flex justify-center mb-4">
            <div className="bg-gray-100 text-gray-600 rounded-full px-4 py-2 text-xs font-medium shadow-sm">
              {message.content}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={`flex flex-col h-full bg-background border-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Claude AI Chat</h2>
            <p className="text-sm text-muted-foreground">Interactive AI assistant</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge 
            variant="secondary" 
            className={`${
              claudeReady 
                ? 'bg-green-500/10 text-green-500' 
                : isConnected
                ? 'bg-yellow-500/10 text-yellow-500'
                : isConnecting 
                ? 'bg-blue-500/10 text-blue-500' 
                : 'bg-red-500/10 text-red-500'
            }`}
          >
            <span 
              className={`w-2 h-2 rounded-full mr-2 ${
                claudeReady 
                  ? 'bg-green-500 animate-pulse' 
                  : isConnected
                  ? 'bg-yellow-500 animate-pulse'
                  : isConnecting 
                  ? 'bg-blue-500 animate-pulse' 
                  : 'bg-red-500'
              }`}
            />
            {claudeReady ? 'Claude Ready' : isConnected ? 'Starting Claude' : isConnecting ? 'Connecting' : 'Disconnected'}
          </Badge>
          
          {/* Usage Status Badge */}
          <Badge 
            variant="secondary" 
            className={`${
              usageStatus === 'warning' 
                ? 'bg-red-500/10 text-red-600 border-red-200' 
                : usageStatus === 'limited'
                ? 'bg-gray-500/10 text-gray-600 border-gray-200'
                : 'bg-green-500/10 text-green-600 border-green-200'
            }`}
          >
            <span 
              className={`w-2 h-2 rounded-full mr-2 ${
                usageStatus === 'warning' 
                  ? 'bg-red-500 animate-pulse' 
                  : usageStatus === 'limited'
                  ? 'bg-gray-500'
                  : 'bg-green-500'
              }`}
            />
            {usageStatus === 'warning' && 'Limit Warning'}
            {usageStatus === 'limited' && 'Usage Limited'}
            {usageStatus === 'normal' && 'Usage Normal'}
          </Badge>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={connectToClaude}
            disabled={isConnecting || isConnected}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-2 max-h-[calc(100vh-200px)] bg-white"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center py-12">
            <div className="max-w-md">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold mb-3 text-gray-800">Claude AI Assistant</h3>
              
              {/* Usage Status Indicator */}
              <div className={`mb-4 p-3 rounded-lg text-sm font-medium text-center ${
                usageStatus === 'warning' 
                  ? 'bg-red-50 border border-red-200 text-red-700' 
                  : usageStatus === 'limited' 
                  ? 'bg-gray-50 border border-gray-200 text-gray-700'
                  : 'bg-green-50 border border-green-200 text-green-700'
              }`}>
                {usageStatus === 'warning' && (
                  <>⚠️ Approaching Weekly Usage Limit - Use Claude Carefully</>
                )}
                {usageStatus === 'limited' && (
                  <>🚫 Usage Limit Reached - Please Try Again Later</>
                )}
                {usageStatus === 'normal' && (
                  <>✅ Claude Usage Normal - Ready to Chat</>
                )}
              </div>
              
              <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                {claudeReady 
                  ? "Claude is ready to help! Ask questions, request code changes, analyze your trading strategies, and more."
                  : "Connecting to Claude AI... Please wait while we establish the connection."
                }
              </p>
              {claudeReady && (
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full px-4 py-2 hover:bg-blue-50 border-blue-200 text-blue-700"
                    onClick={() => setCurrentInput("Analyze my trading strategy performance")}
                  >
                    📊 Analyze Strategy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full px-4 py-2 hover:bg-red-50 border-red-200 text-red-700"
                    onClick={() => setCurrentInput("Help me debug trading issues")}
                  >
                    🐛 Debug Issues
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full px-4 py-2 hover:bg-green-50 border-green-200 text-green-700"
                    onClick={() => setCurrentInput("Review my code and suggest improvements")}
                  >
                    💡 Code Review
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {messages.map(renderMessage)}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce-delay-1"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce-delay-2"></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex space-x-2 mb-2">
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                claudeReady 
                  ? "Type your message to Claude... (Enter to send, Shift+Enter for new line)"
                  : "Waiting for Claude to start..."
              }
              className="min-h-[44px] max-h-32 resize-none pr-20"
              disabled={!isConnected || !claudeReady}
            />
            <div className="absolute right-2 top-2 flex space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={handlePaste}
                title="Paste from clipboard"
              >
                📥
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={sendMessage}
                disabled={!currentInput.trim() || !isConnected || !claudeReady}
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Helper Text */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>💡 <strong>Paste:</strong> Ctrl/Cmd+V</span>
            <span>📝 <strong>Send:</strong> Enter</span>
            <span>🔄 <strong>New Line:</strong> Shift+Enter</span>
          </div>
          <div className="flex items-center space-x-1">
            <Terminal className="h-3 w-3" />
            <span>Claude CLI via chat interface</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ClaudeChat;