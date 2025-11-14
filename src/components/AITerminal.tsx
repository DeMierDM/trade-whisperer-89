/**
 * AI Terminal Component
 * Integrated Claude terminal with WebSocket communication
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import io, { Socket } from 'socket.io-client';

interface TerminalMessage {
  type: 'output' | 'input' | 'system' | 'error';
  content: string;
  timestamp: Date;
  id: string;
}

interface AITerminalProps {
  className?: string;
}

export const AITerminal: React.FC<AITerminalProps> = ({ className = '' }) => {
  const { toast } = useToast();
  
  // Terminal state
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [terminalId, setTerminalId] = useState<string | null>(null);
  
  // WebSocket connection
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Refs
  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Connect to Claude AI Terminal WebSocket
  useEffect(() => {
    connectToTerminal();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle native paste events
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => {
      if (inputRef.current === document.activeElement) {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain');
        if (text && socket && terminalId) {
          socket.emit('terminal-input', {
            terminalId,
            input: text
          });
          setCurrentInput(prev => prev + text);
        }
      }
    };

    document.addEventListener('paste', handlePasteEvent);
    return () => document.removeEventListener('paste', handlePasteEvent);
  }, [socket, terminalId]);

  const connectToTerminal = () => {
    setConnecting(true);
    
    try {
      // Connect to Claude AI Terminal Bridge (port 8081)
      const newSocket = io('http://localhost:8081', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to Claude AI Terminal');
        setConnected(true);
        setConnecting(false);
        
        // Create new terminal session
        newSocket.emit('create-terminal', {
          sessionId: 'claude-persistent-main'
        });

        addMessage('system', '🤖 Connected to Claude AI Terminal');
        
        toast({
          title: "Claude AI Connected",
          description: "Terminal interface is ready for use",
          duration: 3000,
        });
      });

      newSocket.on('terminal-created', (data) => {
        console.log('🔧 Terminal session created:', data.terminalId);
        setTerminalId(data.terminalId);
        addMessage('system', `📡 Terminal session: ${data.terminalId}`);
      });

      newSocket.on('terminal-output', (data) => {
        const { data: output } = data;
        if (output && output.trim()) {
          addMessage('output', output);
        }
      });

      newSocket.on('terminal-exit', (data) => {
        addMessage('error', `Terminal exited with code: ${data.code}`);
        setConnected(false);
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Disconnected from Claude AI Terminal');
        setConnected(false);
        setConnecting(false);
        addMessage('error', '❌ Disconnected from Claude AI Terminal');
      });

      newSocket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        setConnected(false);
        setConnecting(false);
        addMessage('error', `Connection error: ${error.message}`);
        
        toast({
          title: "Connection Failed",
          description: "Could not connect to Claude AI Terminal. Make sure the service is running.",
          variant: "destructive",
          duration: 5000,
        });
      });

      setSocket(newSocket);

    } catch (error) {
      console.error('❌ Failed to connect to terminal:', error);
      setConnecting(false);
      addMessage('error', `Failed to connect: ${error}`);
    }
  };

  const addMessage = (type: TerminalMessage['type'], content: string) => {
    const message: TerminalMessage = {
      type,
      content,
      timestamp: new Date(),
      id: `msg-${Date.now()}-${Math.random()}`
    };
    
    setMessages(prev => [...prev, message]);
  };

  const sendCommand = (command: string) => {
    if (!socket || !connected || !terminalId) {
      toast({
        title: "Terminal Not Ready",
        description: "Please wait for terminal connection to be established",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (!command.trim()) return;

    // Add command to display
    addMessage('input', `$ ${command}`);

    // Send to terminal
    socket.emit('terminal-input', {
      terminalId,
      input: `${command}\n`
    });

    // Clear input
    setCurrentInput('');
  };

  const handlePaste = async () => {
    if (!socket || !terminalId) return;
    
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        // Handle multiline paste - show confirmation for large pastes
        const lineCount = text.split('\n').length;
        if (lineCount > 10) {
          const confirmed = window.confirm(
            `You're pasting ${lineCount} lines of text. This will be sent directly to the terminal. Continue?`
          );
          if (!confirmed) return;
        }

        // Send pasted text to terminal character by character for better handling
        socket.emit('terminal-input', {
          terminalId,
          input: text
        });
        
        // Update current input display (only for single line)
        if (lineCount === 1) {
          setCurrentInput(prev => prev + text);
        } else {
          setCurrentInput(''); // Clear for multiline
        }

        addMessage('system', `📥 Pasted ${text.length} characters${lineCount > 1 ? ` (${lineCount} lines)` : ''}`);
      }
    } catch (err) {
      console.warn('Failed to read clipboard:', err);
      // Fallback: show paste instruction
      addMessage('system', '💡 Tip: Use right-click → Paste or enable clipboard permissions in browser');
    }
  };

  const copyFromTerminal = () => {
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      navigator.clipboard.writeText(selection.toString()).then(() => {
        addMessage('system', '📋 Copied to clipboard!');
      }).catch(err => {
        console.warn('Failed to copy to clipboard:', err);
        addMessage('system', '⚠️ Copy failed - try selecting text and using Ctrl+C');
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (!socket || !terminalId) return;

    // Handle clipboard operations first (don't preventDefault for these)
    if ((e.ctrlKey || e.metaKey)) {
      switch (e.key.toLowerCase()) {
        case 'c':
          // Allow default copy behavior if text is selected
          if (window.getSelection()?.toString()) {
            return; // Let browser handle copy
          }
          // Send Ctrl+C to terminal for interrupt
          e.preventDefault();
          socket.emit('terminal-input', {
            terminalId,
            input: '\x03' // Ctrl+C
          });
          return;
        case 'v':
          // Handle paste
          e.preventDefault();
          handlePaste();
          return;
        case 'a':
          // Allow select all in terminal output
          return; // Let browser handle select all
        case 'x':
          // Allow cut if text is selected
          if (window.getSelection()?.toString()) {
            return; // Let browser handle cut
          }
          break;
      }
    }

    e.preventDefault();
    
    let keyToSend = '';
    
    // Handle special keys for interactive CLI applications
    switch (e.key) {
      case 'Enter':
        keyToSend = '\r';
        setCurrentInput('');
        break;
      case 'Backspace':
        keyToSend = '\b';
        setCurrentInput(prev => prev.slice(0, -1));
        break;
      case 'Tab':
        keyToSend = '\t';
        break;
      case 'ArrowUp':
        keyToSend = '\x1b[A';
        break;
      case 'ArrowDown':
        keyToSend = '\x1b[B';
        break;
      case 'ArrowRight':
        keyToSend = '\x1b[C';
        break;
      case 'ArrowLeft':
        keyToSend = '\x1b[D';
        break;
      case 'Escape':
        keyToSend = '\x1b';
        break;
      case 'Delete':
        keyToSend = '\x7f';
        break;
      default:
        // Regular characters
        if (e.key.length === 1) {
          keyToSend = e.key;
          if (e.key !== '\r' && e.key !== '\n') {
            setCurrentInput(prev => prev + e.key);
          }
        }
        break;
    }
    
    // Send the key immediately to the terminal for interactive mode
    if (keyToSend) {
      socket.emit('terminal-input', {
        terminalId,
        input: keyToSend
      });
    }
  };

  const clearTerminal = () => {
    setMessages([]);
    addMessage('system', '🧹 Terminal cleared');
  };

  const restartTerminal = () => {
    if (socket) {
      socket.disconnect();
    }
    setMessages([]);
    setConnected(false);
    setTerminalId(null);
    setTimeout(() => {
      connectToTerminal();
    }, 1000);
  };

  const sendQuickCommand = (command: string) => {
    sendCommand(command);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <Card className={`p-6 bg-gradient-card border-border shadow-card h-full ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Claude AI Terminal</h2>
            <p className="text-sm text-muted-foreground">Integrated AI assistant with full codebase access</p>
          </div>
        </div>
        <Badge 
          variant="secondary" 
          className={`${connected ? 'bg-green-500/10 text-green-500' : connecting ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'}`}
        >
          <span 
            className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500 animate-pulse' : connecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}
          ></span>
          {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
        </Badge>
      </div>

      <div className="h-full flex flex-col">
        {/* Terminal Output Area */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-border overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Terminal Header */}
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <span className="text-gray-300 text-sm font-mono">claude@trading-system:~/workspace</span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400 hover:text-gray-200 h-6 px-2"
                  onClick={copyFromTerminal}
                  title="Copy selected text"
                >
                  📋 Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400 hover:text-gray-200 h-6 px-2"
                  onClick={handlePaste}
                  title="Paste from clipboard"
                >
                  📥 Paste
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400 hover:text-gray-200 h-6 px-2"
                  onClick={clearTerminal}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400 hover:text-gray-200 h-6 px-2"
                  onClick={restartTerminal}
                  disabled={connecting}
                >
                  Restart
                </Button>
              </div>
            </div>

            {/* Terminal Content */}
            <div 
              ref={terminalOutputRef}
              className="flex-1 p-4 overflow-y-auto font-mono text-sm cursor-text select-text"
              onClick={() => inputRef.current?.focus()}
              onContextMenu={(e) => {
                // Allow native context menu for copy/paste
                // Browser will handle copy if text is selected
                // We can add custom context menu later if needed
              }}
            >
              {messages.map((message) => (
                <div key={message.id} className="mb-1">
                  {message.type === 'input' && (
                    <div className="text-blue-400">{message.content}</div>
                  )}
                  {message.type === 'output' && (
                    <div className="text-gray-300 whitespace-pre-wrap">{message.content}</div>
                  )}
                  {message.type === 'system' && (
                    <div className="text-gray-500"># {message.content}</div>
                  )}
                  {message.type === 'error' && (
                    <div className="text-red-400">{message.content}</div>
                  )}
                </div>
              ))}
              
              {/* Cursor */}
              {connected && (
                <div className="flex items-center">
                  <span className="text-blue-400">claude@trading-system</span>
                  <span className="text-gray-500">:</span>
                  <span className="text-blue-300">~/workspace</span>
                  <span className="text-green-400 ml-1">$ </span>
                  <span className="w-2 h-4 bg-green-400 ml-1 animate-pulse"></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Command Input Area */}
        <div className="mt-4 flex space-x-2">
          <div className="flex-1">
            <Input
              ref={inputRef}
              value={currentInput}
              onChange={() => {}} // Prevent default change handling since we handle keys directly
              onKeyDown={handleKeyPress}
              placeholder="Type your message to Claude or command to execute..."
              className="bg-gray-900 border-gray-700 text-gray-100 font-mono placeholder-gray-500"
              disabled={!connected}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button 
            className="bg-primary hover:bg-primary/90"
            onClick={() => sendCommand(currentInput)}
            disabled={!connected || !currentInput.trim()}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="text-xs" onClick={() => sendQuickCommand('claude "Analyze the current strategy performance and suggest optimizations"')}>
            📊 Analyze Strategy Performance
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => sendQuickCommand('ls -la')}>
            📁 List Files
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => sendQuickCommand('claude "Help me debug any trading issues"')}>
            🔍 Debug Trading Issue
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => sendQuickCommand('claude "Review my code and suggest improvements"')}>
            💡 Optimize Code
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => sendQuickCommand('claude "Generate a new trading strategy based on current market conditions"')}>
            📈 Generate New Strategy
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => sendQuickCommand('claude help')}>
            ❓ Claude Help
          </Button>
        </div>

        {/* Clipboard Help */}
        <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>💡 <strong>Copy:</strong> Select text + Ctrl/Cmd+C</span>
            <span>📥 <strong>Paste:</strong> Ctrl/Cmd+V or use Paste button</span>
            <span>🔄 <strong>Interrupt:</strong> Ctrl/Cmd+C (when no text selected)</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AITerminal;