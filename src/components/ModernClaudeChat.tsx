import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import './ModernClaudeChat.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Send, 
  Copy, 
  Check, 
  RefreshCw, 
  Bot,
  User,
  Loader2,
  Brain,
  Sparkles,
  AlertTriangle,
  MessageSquare
} from 'lucide-react';

interface ClaudeMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'thinking' | 'error' | 'usage-warning';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  isStreaming?: boolean;
}

interface ClaudeChatProps {
  className?: string;
}

// Generate unique IDs to prevent React key collisions
let messageCounter = 0;
const generateId = (type: string) => {
  messageCounter++;
  return `${type}-${Date.now()}-${messageCounter}`;
};

const ModernClaudeChat: React.FC<ClaudeChatProps> = ({ className = '' }) => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [claudeReady, setClaudeReady] = useState(false);
  const [usageStatus, setUsageStatus] = useState<'normal' | 'warning' | 'critical'>('normal');
  const [currentThinkingMessage, setCurrentThinkingMessage] = useState<string | null>(null);
  
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

  // Clean Claude output by removing terminal escape sequences and noise
  const cleanClaudeOutput = (rawOutput: string): string => {
    const cleaned = rawOutput
      // Remove ANSI escape sequences
      .replace(/\x1b\[[0-9;]*[mGKHJABCDEFG]/g, '')
      .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
      // Remove control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove cursor movement sequences
      .replace(/\x1b\[\?[0-9]+[hl]/g, '')
      .replace(/\x1b\[[0-9]+;[0-9]+[Hf]/g, '')
      // Clean up whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    // Filter out Claude startup prompts and interactive mode prompts
    if (cleaned.includes('Try "') || 
        cleaned.includes('> Try') ||
        cleaned.startsWith('────────────') ||
        /^>\s*$/m.test(cleaned) ||
        cleaned === '#' ||
        cleaned.includes('refactor') && cleaned.length < 50) {
      console.log('🚫 Filtered Claude startup prompt:', cleaned.substring(0, 100));
      return '';
    }
    
    return cleaned;
  };

  // Context7 Pattern: Enhanced response validation for streaming conversations
  const isValidClaudeResponse = (text: string): boolean => {
    if (!text || text.length < 5) return false;
    
    // Skip obvious terminal noise
    const terminalPatterns = [
      /^[\$#>]\s*$/,                    // Shell prompts
      /^(root@|user@)/,                 // User prompts
      /^(clear|ls|cd|pwd|exit|node)$/i, // Simple commands
      /^\d+\s*$/,                       // Just numbers
      /^[^\w\s]*$/,                     // Only symbols
      /^\/[\w\/]+\s*$/,                 // File paths
      /^Authenticat/i,                  // Auth messages
      /^Connect/i,                      // Connection messages
      /^Welcome to/i,                   // Welcome messages
      /^Loading/i,                      // Loading messages
      /^Initializing/i,                 // Init messages
    ];
    
    if (terminalPatterns.some(pattern => pattern.test(text))) {
      return false;
    }
    
    // Context7 Pattern: Look for streaming response indicators
    const hasLetters = /[a-zA-Z]{2,}/.test(text);
    const hasWords = text.trim().split(/\s+/).length >= 2;
    
    // Context7 Pattern: Check for conversational patterns or structured responses
    const hasConversationalPatterns = /\b(I|you|can|will|would|should|let|help|this|that|we|me|here|what|how|when|where|why|yes|no|sure|okay|proceed|edit)\b/i.test(text);
    const hasStructuredResponse = /[.!?,:;]/.test(text) || text.includes('\n');
    const hasCodeResponse = /```|`[^`]+`|function|class|const|let|var/.test(text);
    const hasMathResponse = /\d+\s*[\+\-\*\/\=]\s*\d+|\d{2,}/.test(text); // Numbers or math
    
    const isValid = hasLetters && (hasWords || hasStructuredResponse || hasCodeResponse || hasConversationalPatterns || hasMathResponse);
    
    // Enhanced logging to debug response validation
    console.log(`🔍 Response validation for "${text.substring(0, 100)}":`, {
      hasLetters,
      hasWords,
      hasConversationalPatterns,
      hasStructuredResponse,
      hasCodeResponse,
      hasMathResponse,
      isValid: isValid ? '✅ VALID' : '❌ INVALID'
    });
    
    // Context7 Pattern: Accept responses that look like meaningful content
    return isValid;
  };

  // Detect Claude thinking state - be more specific to avoid false positives
  const isThinkingMessage = (text: string): boolean => {
    return /claude\s+is\s+thinking/i.test(text) ||
           /thinking\s+about\s+your/i.test(text) ||
           /processing\s+your\s+request/i.test(text) ||
           /analyzing\s+your\s+(question|request|message)/i.test(text);
  };

  // Detect usage warnings
  const isUsageWarning = (text: string): boolean => {
    return /approaching\s+weekly\s+limit|usage\s+limit|rate\s+limit|weekly\s+limit/i.test(text);
  };

  // Context7 Pattern: Enhanced streaming response processing with proper state management
  const processClaudeOutput = (rawOutput: string) => {
    const cleanedOutput = cleanClaudeOutput(rawOutput);
    
    if (!cleanedOutput) return;
    
    console.log('🔍 Processing Claude output:', cleanedOutput.substring(0, 100) + '...');

    // Context7 Pattern: Handle Claude startup and ready state with proper detection
    if (cleanedOutput.includes('Claude Code') || 
        cleanedOutput.includes('Sonnet') || 
        cleanedOutput.includes('workspace') ||
        cleanedOutput.includes('3.5') ||
        /claude.*ready/i.test(cleanedOutput)) {
      if (!claudeReady) {
        setClaudeReady(true);
        addSystemMessage('✨ Claude AI is ready! Start your conversation.');
        return;
      }
    }

    // Context7 Pattern: Enhanced thinking state detection - only for actual user interactions
    if (isThinkingMessage(cleanedOutput)) {
      handleThinkingState(cleanedOutput);
      return;
    }

    // Context7 Pattern: Usage warning detection
    if (isUsageWarning(cleanedOutput)) {
      handleUsageWarning(cleanedOutput);
      return;
    }

    // Context7 Pattern: Streaming JSON response detection - look for actual responses
    const isStreamingResponse = cleanedOutput.length > 20 && 
                               (cleanedOutput.includes('.') || 
                                cleanedOutput.includes('?') ||
                                cleanedOutput.includes('!') ||
                                /[a-zA-Z]{3,}/.test(cleanedOutput));

    // Context7 Pattern: Enhanced response validation for interactive conversation
    console.log('🎯 Checking if response should be displayed:', {
      rawLength: rawOutput.length,
      cleanedLength: cleanedOutput.length,
      isValid: isValidClaudeResponse(cleanedOutput),
      isStreaming: isStreamingResponse,
      content: cleanedOutput.substring(0, 200)
    });

    if (isValidClaudeResponse(cleanedOutput) || isStreamingResponse) {
      // Clear any active thinking state
      if (currentThinkingMessage) {
        setCurrentThinkingMessage(null);
        setIsTyping(false);
      }
      
      console.log('✅ ADDING Claude response to chat:', cleanedOutput.substring(0, 200));
      addAssistantMessage(cleanedOutput);
      console.log('📝 Message added, current message count:', messages.length + 1);
    } else {
      console.log('🚫 REJECTED - Not adding to chat:', cleanedOutput.substring(0, 100));
    }
  };

  // Context7 Pattern: Enhanced thinking state management with real-time feedback
  const handleThinkingState = (output: string) => {
    const thinkingPatterns = [
      'Thinking on',
      'tab to toggle',
      'thinking',
      'processing',
      'analyzing',
      'working on',
      'calculating'
    ];
    
    if (thinkingPatterns.some(pattern => output.toLowerCase().includes(pattern.toLowerCase()))) {
      if (!currentThinkingMessage) {
        setCurrentThinkingMessage('Claude is thinking about your request...');
        setIsTyping(true);
        
        // Context7 Pattern: Auto-clear thinking state if no response after reasonable time
        setTimeout(() => {
          if (currentThinkingMessage) {
            console.log('🕐 Thinking timeout - clearing state');
            setCurrentThinkingMessage(null);
            setIsTyping(false);
          }
        }, 15000); // 15 second timeout
      }
    }
  };

  // Handle usage warnings with proper UI feedback
  const handleUsageWarning = (output: string) => {
    if (output.includes('Approaching weekly limit')) {
      setUsageStatus('warning');
      addUsageWarningMessage('⚠️ Approaching weekly usage limit - please use Claude efficiently');
    } else if (output.includes('usage limit') || output.includes('rate limit')) {
      setUsageStatus('critical');
      addUsageWarningMessage('🚫 Usage limit reached - please try again later');
    }
  };

  // Message creation helpers
  const addSystemMessage = (content: string) => {
    const message: ClaudeMessage = {
      id: generateId('system'),
      type: 'system',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const addUserMessage = (content: string) => {
    const message: ClaudeMessage = {
      id: generateId('user'),
      type: 'user',
      content,
      timestamp: new Date(),
      status: 'sending'
    };
    setMessages(prev => [...prev, message]);

    // Context7 Pattern: Enhanced message sending using terminal bridge print mode
    if (socket && terminalId && claudeReady) {
      // Show thinking state immediately
      setCurrentThinkingMessage('Claude is thinking about your request...');
      setIsTyping(true);
      
      // Send message to Claude via terminal bridge (it will use claude -p mode)
      socket.emit('terminal-input', {
        terminalId,
        input: content // Don't add newline - terminal bridge handles it
      });

      // Update status
      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.id === message.id ? { ...msg, status: 'sent' as const } : msg
        ));
      }, 300);
      
      // Context7 Pattern: Timeout fallback if Claude doesn't respond
      setTimeout(() => {
        if (currentThinkingMessage) {
          console.log('⚠️ Claude response timeout - clearing thinking state');
          setCurrentThinkingMessage(null);
          setIsTyping(false);
          addSystemMessage('⏱️ Claude may be having issues. The CLI might be hanging in interactive mode.');
        }
      }, 30000); // 30 second timeout
    } else {
      // Update to error if not connected
      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.id === message.id ? { ...msg, status: 'error' as const } : msg
        ));
      }, 500);
    }
  };

  // Context7 Pattern: Streaming response handler with proper state management
  const addAssistantMessage = (content: string) => {
    console.log('📨 addAssistantMessage called with:', content.substring(0, 100));
    
    // Clear thinking state immediately when response starts
    if (currentThinkingMessage) {
      console.log('🧹 Clearing thinking state');
      setCurrentThinkingMessage(null);
    }
    setIsTyping(true);
    
    // Context7 Pattern: Immediate response display for better interactivity
    const message: ClaudeMessage = {
      id: generateId('assistant'),
      type: 'assistant',
      content,
      timestamp: new Date(),
      isStreaming: false
    };
    
    console.log('📝 Created message object:', { id: message.id, contentLength: content.length });
    
    // Add message immediately for responsive feel
    setMessages(prev => {
      console.log('🔄 Updating messages state, previous count:', prev.length);
      const newMessages = [...prev, message];
      console.log('➕ New messages count:', newMessages.length);
      return newMessages;
    });
    setIsTyping(false);
    
    console.log('✅ Claude response SUCCESSFULLY added to chat:', content.substring(0, 100));
  };

  const addUsageWarningMessage = (content: string) => {
    const message: ClaudeMessage = {
      id: generateId('usage-warning'),
      type: 'usage-warning',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  // Connection management
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
        console.log('✅ Connected to Claude bridge');
        setIsConnected(true);
        setIsConnecting(false);
        
        // Use the persistent terminal ID instead of generating unique ones
        newSocket.emit('create-terminal', {
          sessionId: 'claude-persistent-main'
        });

        addSystemMessage('🔌 Connected to Claude bridge - connecting to persistent terminal...');
      });

      newSocket.on('terminal-created', (data: { terminalId: string }) => {
        setTerminalId(data.terminalId);
        console.log('🖥️ Terminal created:', data.terminalId);
        
        addSystemMessage('🚀 Starting Claude AI...');
        
        // Context7 Pattern: Skip Claude startup - let terminal bridge handle it
        setTimeout(() => {
          newSocket.emit('terminal-input', {
            terminalId: data.terminalId,
            input: 'clear\n'
          });
          
          // Don't start Claude interactively - the terminal bridge will use print mode
          // Just mark Claude as ready after a brief delay
          setTimeout(() => {
            setClaudeReady(true);
            addSystemMessage('✨ Claude AI is ready! Send a message to test.');
          }, 1500);
        }, 1000);
      });

      // Context7 Pattern: DISABLED - terminal output processing to prevent duplicate responses
      // Using claude-response event instead for cleaner, pre-filtered responses
      // newSocket.on('terminal-output', (data: { terminalId: string; data: string }) => {
      //   console.log('📡 Raw terminal output:', data.data.substring(0, 200));
      //   processClaudeOutput(data.data);
      // });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        setClaudeReady(false);
        addSystemMessage('❌ Disconnected from Claude AI');
      });

      newSocket.on('error', (error: any) => {
        console.error('❌ Socket error:', error);
        addSystemMessage(`Connection error: ${error.message}`);
      });

      // Context7 Pattern: Handle direct Claude responses from print mode
      newSocket.on('claude-response', (data: { terminalId: string; response: string; timestamp: number; sessionLimit?: boolean }) => {
        console.log('🎯 Received direct Claude response:', data.response.substring(0, 200));
        
        if (data.response && data.response.trim().length > 0) {
          // Handle session limit messages specially
          if (data.sessionLimit || data.response.includes('Session limit reached')) {
            console.log('🚨 Session limit detected - showing limit message');
            const limitMessage = `⚠️ **Claude Session Limit Reached**\n\n${data.response}\n\n*You can continue chatting after the reset time.*`;
            addAssistantMessage(limitMessage);
          } else {
            console.log('✅ ADDING direct Claude response to chat:', data.response);
            addAssistantMessage(data.response.trim());
          }
          setCurrentThinkingMessage(null); // Clear thinking state
          setIsTyping(false);
        }
      });

      // Context7 Pattern: Handle Claude processing status
      newSocket.on('claude-processing', (data: { terminalId: string; status: string }) => {
        console.log('🤖 Claude processing status:', data.status);
        if (data.status === 'waiting') {
          setCurrentThinkingMessage('Claude is thinking...');
          setIsTyping(true);
        }
      });

      setSocket(newSocket);

    } catch (error) {
      console.error('Failed to connect:', error);
      setIsConnecting(false);
      addSystemMessage('❌ Failed to connect to Claude AI bridge');
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

  // Send message handler
  const sendMessage = () => {
    if (!currentInput.trim() || !isConnected || !claudeReady) return;
    
    addUserMessage(currentInput.trim());
    setCurrentInput('');
    inputRef.current?.focus();
  };

  // Copy message content
  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      // Success feedback could go here
    });
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Modern message renderer
  const renderMessage = (message: ClaudeMessage) => {
    switch (message.type) {
      case 'user':
        return (
          <div key={message.id} className="flex justify-end mb-6">
            <div className="flex items-start gap-3 max-w-[80%]">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <div className="flex items-center justify-end mt-2 gap-2">
                  <span className="text-xs opacity-75">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {message.status === 'sending' && <Loader2 className="h-3 w-3 animate-spin opacity-75" />}
                  {message.status === 'sent' && <Check className="h-3 w-3 opacity-75" />}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
        );

      case 'assistant':
        return (
          <div key={message.id} className="flex justify-start mb-6">
            <div className="flex items-start gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm hover:shadow-md transition-shadow group">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800 mb-2">{message.content}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Claude • {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 h-7 px-2 hover:bg-gray-100 transition-all"
                    onClick={() => copyMessage(message.content)}
                  >
                    <Copy className="h-3 w-3 text-gray-500" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'system':
        return (
          <div key={message.id} className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-full px-4 py-2 text-xs font-medium shadow-sm border">
              <MessageSquare className="h-3 w-3 inline mr-2" />
              {message.content}
            </div>
          </div>
        );

      case 'usage-warning':
        return (
          <div key={message.id} className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 text-amber-800 rounded-lg px-4 py-3 text-sm font-medium shadow-sm max-w-md text-center">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {message.content}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={`flex flex-col h-full bg-gradient-to-br from-gray-50 to-white ${className}`}>
      {/* Modern Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Claude AI
            </h2>
            <p className="text-sm text-gray-500 font-medium">
              Your intelligent coding assistant
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <Badge 
            className={`px-3 py-1 text-xs font-semibold shadow-sm transition-all ${
              claudeReady 
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300' 
                : isConnected
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : isConnecting 
                ? 'bg-blue-100 text-blue-700 border-blue-300' 
                : 'bg-red-100 text-red-700 border-red-300'
            }`}
          >
            <span 
              className={`w-2 h-2 rounded-full mr-2 transition-all ${
                claudeReady 
                  ? 'bg-emerald-500 claude-ready-indicator' 
                  : isConnected
                  ? 'bg-amber-500 animate-pulse'
                  : isConnecting 
                  ? 'bg-blue-500 animate-pulse' 
                  : 'bg-red-500'
              } ${
                currentThinkingMessage ? 'claude-thinking-indicator' : ''
              }`}
            />
            {claudeReady ? 'Ready' : isConnected ? 'Starting' : isConnecting ? 'Connecting' : 'Offline'}
          </Badge>
          
          {/* Usage Status */}
          <Badge 
            className={`px-3 py-1 text-xs font-semibold shadow-sm ${
              usageStatus === 'critical' 
                ? 'bg-red-100 text-red-700 border-red-300' 
                : usageStatus === 'warning'
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-emerald-100 text-emerald-700 border-emerald-300'
            }`}
          >
            {usageStatus === 'critical' && '🚫 Limited'}
            {usageStatus === 'warning' && '⚠️ Warning'}
            {usageStatus === 'normal' && '✅ Normal'}
          </Badge>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={connectToClaude}
            disabled={isConnecting || isConnected}
            className="hover:bg-gray-100"
          >
            <RefreshCw className={`h-4 w-4 ${isConnecting ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-2 bg-gradient-to-b from-white to-gray-50 chat-container"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 via-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                <Brain className="h-10 w-10 text-white" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-800 mb-3">
                Welcome to Claude AI
              </h3>
              
              <div className={`mb-6 p-4 rounded-xl text-center font-medium ${
                usageStatus === 'critical' 
                  ? 'bg-red-50 border border-red-200 text-red-700' 
                  : usageStatus === 'warning' 
                  ? 'bg-amber-50 border border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              }`}>
                {usageStatus === 'critical' && '🚫 Usage limit reached - please try later'}
                {usageStatus === 'warning' && '⚠️ Approaching usage limit - use efficiently'}
                {usageStatus === 'normal' && '✨ Ready to assist with your coding needs'}
              </div>
              
              <p className="text-gray-600 mb-6 leading-relaxed">
                {claudeReady 
                  ? "I'm ready to help with code analysis, debugging, strategy development, and more!"
                  : "Establishing connection to Claude AI..."
                }
              </p>
              
              {claudeReady && (
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full hover:bg-blue-50 border-blue-200 text-blue-700"
                    onClick={() => setCurrentInput("Help me analyze my trading strategy")}
                  >
                    📊 Strategy Analysis
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full hover:bg-green-50 border-green-200 text-green-700"
                    onClick={() => setCurrentInput("Review my code for improvements")}
                  >
                    🔍 Code Review
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full hover:bg-purple-50 border-purple-200 text-purple-700"
                    onClick={() => setCurrentInput("Help me debug an issue")}
                  >
                    🐛 Debug Help
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {messages.map(renderMessage)}
        
        {/* Thinking Indicator */}
        {(isTyping || currentThinkingMessage) && (
          <div className="flex justify-start">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Brain className="h-4 w-4 text-white animate-pulse" />
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce thinking-dot-1" />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce thinking-dot-2" />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce thinking-dot-3" />
                  </div>
                  <span className="text-sm text-purple-700 font-medium">
                    {currentThinkingMessage || 'Claude is thinking...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Modern Input Area */}
      <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm p-4">
        <div className="flex gap-3 mb-3">
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                claudeReady 
                  ? "Ask Claude anything... (Enter to send, Shift+Enter for new line)"
                  : usageStatus === 'critical'
                  ? "Usage limit reached - please try again later"
                  : "Waiting for Claude to be ready..."
              }
              className="min-h-[50px] max-h-32 resize-none pr-14 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={!isConnected || !claudeReady || usageStatus === 'critical'}
            />
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={!currentInput.trim() || !isConnected || !claudeReady || usageStatus === 'critical'}
              className="absolute right-2 top-2 h-9 w-9 p-0 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 shadow-sm"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Helper Text */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>💫 <strong>Send:</strong> Enter</span>
            <span>📝 <strong>New Line:</strong> Shift+Enter</span>
            <span>📋 <strong>Copy:</strong> Click message</span>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span>Powered by Claude AI</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ModernClaudeChat;