import React, { useState, useEffect, useRef } from 'react';
import { Users, MessageSquare, Send, XCircle, Moon, Sun, Sparkles, Wifi, WifiOff } from 'lucide-react';

const WEBSOCKET_URL = `ws://127.0.0.1:8000/ws/livechat/agent`;

function AdminPanel() {
  const [ws, setWs] = useState(null);
  const [agentId] = useState(() => `agent_${Math.random().toString(36).substr(2, 9)}`);
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const messagesEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connectWebSocket = () => {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
    }
    
    const socket = new WebSocket(`${WEBSOCKET_URL}/${agentId}`);

    socket.onopen = () => {
        console.log(`✅ Agent WebSocket connected with ID: ${agentId}`);
        setWs(socket);
        setIsConnected(true);
        setReconnectAttempts(0);
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 AGENT BROWSER RECEIVED DATA:', data);

            switch (data.type) {
                case 'queue_update':
                    setWaitingUsers(data.queue);
                    break;
                case 'chat_accepted':
                    setActiveChat({ 
                        userId: data.user_id, 
                        messages: [{ sender: 'system', content: `You are now connected to user ${data.user_id}.` }] 
                    });
                    setWaitingUsers(prev => prev.filter(id => id !== data.user_id));
                    break;

                case 'message':
                    setActiveChat(currentActiveChat => {
                        if (currentActiveChat && data.user_id === currentActiveChat.userId) {
                            return {
                                ...currentActiveChat,
                                messages: [...currentActiveChat.messages, { sender: 'user', content: data.content }]
                            };
                        }
                        return currentActiveChat;
                    });
                    break;

                case 'chat_ended_confirmation':
                    alert(`Chat with ${data.user_id} has ended.`);
                    setActiveChat(null);
                    break;
                case 'user_disconnected':
                    setActiveChat(currentActiveChat => {
                        if (currentActiveChat && data.user_id === currentActiveChat.userId) {
                            alert(`User ${data.user_id} has disconnected.`);
                            return null;
                        }
                        return currentActiveChat;
                    });
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };

    socket.onclose = (event) => {
        console.log('🔌 Agent WebSocket disconnected', event.code, event.reason);
        setIsConnected(false);
        setWs(null);
        
        if (event.code !== 1000 && reconnectAttempts < 5) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
                setReconnectAttempts(prev => prev + 1);
                connectWebSocket();
            }, delay);
        }
    };

    socket.onerror = (error) => {
        console.error('❌ WebSocket Error:', error);
    };
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close(1000, 'Component unmounting');
      }
    };
  }, [agentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  const handleAcceptChat = (userId) => {
    if (ws && ws.readyState === WebSocket.OPEN && !activeChat) {
      ws.send(JSON.stringify({ type: 'accept_chat', user_id: userId }));
    } else {
      alert("You can only handle one chat at a time or the WebSocket is not connected.");
    }
  };

  const handleSendMessage = () => {
    if (ws && ws.readyState === WebSocket.OPEN && activeChat && inputValue.trim()) {
      const message = {
        type: 'message',
        user_id: activeChat.userId,
        content: inputValue.trim(),
      };
      ws.send(JSON.stringify(message));
      setActiveChat(prev => ({ 
        ...prev, 
        messages: [...prev.messages, { sender: 'agent', content: inputValue.trim() }] 
      }));
      setInputValue('');
    }
  };

  const handleEndChat = () => {
    if (ws && ws.readyState === WebSocket.OPEN && activeChat) {
      ws.send(JSON.stringify({ type: 'end_chat', user_id: activeChat.userId }));
    }
  };

  const handleManualReconnect = () => {
    if (!isConnected) {
        setReconnectAttempts(0);
        connectWebSocket();
    }
  };
  
  const toggleTheme = () => setDarkMode(!darkMode);

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'
    }`}>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-20 left-10 w-72 h-72 rounded-full blur-3xl opacity-20 animate-pulse ${
          darkMode ? 'bg-purple-500' : 'bg-purple-300'
        }`} style={{ animationDuration: '4s' }}></div>
        <div className={`absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl opacity-20 animate-pulse ${
          darkMode ? 'bg-blue-500' : 'bg-blue-300'
        }`} style={{ animationDuration: '6s', animationDelay: '1s' }}></div>
        <div className={`absolute top-1/2 left-1/2 w-80 h-80 rounded-full blur-3xl opacity-10 animate-pulse ${
          darkMode ? 'bg-pink-500' : 'bg-pink-300'
        }`} style={{ animationDuration: '5s', animationDelay: '2s' }}></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-2 sm:p-4">
        <div className={`w-full max-w-7xl h-[95vh] rounded-3xl shadow-2xl backdrop-blur-xl transition-all duration-500 flex flex-col overflow-hidden ${
          darkMode 
            ? 'bg-slate-800/40 border border-slate-700/50' 
            : 'bg-white/70 border border-white/60'
        }`}>
          
          <header className={`px-4 sm:px-6 py-4 sm:py-5 border-b transition-colors duration-500 ${
            darkMode ? 'border-slate-700/50' : 'border-slate-200/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`p-2 sm:p-2.5 rounded-2xl transition-all duration-500 ${
                  darkMode 
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500' 
                    : 'bg-gradient-to-br from-purple-400 to-pink-400'
                } shadow-lg`}>
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h1 className={`text-lg sm:text-2xl font-bold transition-colors duration-500 ${
                    darkMode ? 'text-white' : 'text-slate-800'
                  }`}>
                    Agent Chat Panel
                  </h1>
                  <p className={`text-xs sm:text-sm transition-colors duration-500 ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {isConnected ? `ID: ${agentId.substring(0, 12)}...` : 'Disconnected'} • {waitingUsers.length} waiting
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
                  isConnected 
                    ? darkMode ? 'bg-green-500/20 text-green-300' : 'bg-green-500/20 text-green-700'
                    : darkMode ? 'bg-red-500/20 text-red-300' : 'bg-red-500/20 text-red-700'
                }`}>
                  {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>

                {!isConnected && (
                  <button
                    onClick={handleManualReconnect}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-all duration-300 hover:scale-105 ${
                      darkMode 
                        ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' 
                        : 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/30'
                    }`}
                  >
                    <Wifi className="w-3 h-3" />
                    <span>Reconnect</span>
                  </button>
                )}

                {activeChat && (
                  <button 
                    onClick={handleEndChat}
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-all duration-300 hover:scale-105 ${
                      darkMode 
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' 
                        : 'bg-red-500/20 text-red-700 hover:bg-red-500/30'
                    }`}
                  >
                    <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">End Chat</span>
                  </button>
                )}
                
                <button
                  onClick={toggleTheme}
                  className={`p-2 sm:p-3 rounded-xl transition-all duration-300 hover:scale-110 ${
                    darkMode 
                      ? 'bg-slate-700/50 hover:bg-slate-700 text-yellow-400' 
                      : 'bg-slate-200/50 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {darkMode ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <div className={`w-full lg:w-80 border-b lg:border-b-0 lg:border-r transition-colors duration-500 ${
              darkMode ? 'border-slate-700/50 bg-slate-800/20' : 'border-slate-200/50 bg-white/20'
            } overflow-y-auto`}>
              <div className="p-4 sm:p-6">
                <h2 className={`text-base sm:text-lg font-bold mb-4 flex items-center gap-2 transition-colors duration-500 ${
                  darkMode ? 'text-white' : 'text-slate-800'
                }`}>
                  <Users className={`w-4 h-4 sm:w-5 sm:h-5 ${darkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                  Waiting Users 
                  <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                    darkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-500/20 text-purple-700'
                  }`}>
                    {waitingUsers.length}
                  </span>
                </h2>
                
                <div className="space-y-2">
                  {waitingUsers.length > 0 ? (
                    waitingUsers.map((userId, index) => (
                      <div 
                        key={userId}
                        className={`p-3 sm:p-4 rounded-xl flex justify-between items-center transition-all duration-300 hover:scale-[1.02] animate-slideIn ${
                          darkMode ? 'bg-slate-700/50' : 'bg-white/60'
                        }`}
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <span className={`font-mono text-xs sm:text-sm truncate max-w-[120px] sm:max-w-[150px] ${
                          darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          {userId}
                        </span>
                        <button
                          onClick={() => handleAcceptChat(userId)}
                          disabled={!!activeChat || !isConnected}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                            darkMode
                              ? 'bg-gradient-to-br from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
                              : 'bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white'
                          }`}
                        >
                          Accept
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className={`text-center py-8 px-4 rounded-xl ${
                      darkMode ? 'bg-slate-700/30 text-slate-400' : 'bg-white/40 text-slate-600'
                    }`}>
                      <Users className={`w-12 h-12 mx-auto mb-2 opacity-50 ${
                        darkMode ? 'text-slate-500' : 'text-slate-400'
                      }`} />
                      <p className="text-sm">No users waiting</p>
                    </div>
                  )}
                </div>

                {!isConnected && reconnectAttempts > 0 && (
                  <div className={`mt-4 p-3 rounded-lg text-xs ${
                    darkMode ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-500/20 text-yellow-700'
                  }`}>
                    <p>Attempting to reconnect... ({reconnectAttempts}/5)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              {activeChat ? (
                <>
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                    {activeChat.messages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex items-end gap-2 ${
                          msg.sender === 'agent' ? 'justify-end' : 
                          msg.sender === 'system' ? 'justify-center' : 
                          'justify-start'
                        } animate-slideIn`}
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        {msg.sender === 'system' ? (
                          <div className={`text-xs px-3 py-1 rounded-full ${
                            darkMode ? 'text-slate-400 bg-slate-700/50' : 'text-slate-600 bg-slate-300/50'
                          }`}>
                            {msg.content}
                          </div>
                        ) : (
                          <div className={`max-w-[85%] md:max-w-[70%] px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl transition-all duration-300 hover:scale-[1.02] ${
                            msg.sender === 'agent'
                              ? darkMode
                                ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-br-md shadow-lg'
                                : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-br-md shadow-lg'
                              : darkMode
                                ? 'bg-slate-700/50 text-slate-100 rounded-bl-md'
                                : 'bg-white/60 text-slate-800 rounded-bl-md border border-slate-200'
                          }`}>
                            <p className="leading-relaxed text-sm sm:text-base">{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className={`p-3 sm:p-4 border-t transition-colors duration-500 ${
                    darkMode ? 'border-slate-700/50 bg-slate-800/30' : 'border-slate-200/50 bg-white/30'
                  }`}>
                    <div className="flex gap-2 max-w-4xl mx-auto">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={isConnected ? `Reply to ${activeChat.userId.substring(0, 10)}...` : "Connecting..."}
                        disabled={!isConnected}
                        className={`w-full px-4 sm:px-5 py-2.5 sm:py-3.5 text-sm sm:text-base rounded-2xl outline-none transition-all duration-300 focus:ring-2 ${
                          darkMode
                            ? 'bg-slate-700/50 text-white placeholder-slate-400 focus:ring-purple-500/50 focus:bg-slate-700/70'
                            : 'bg-white/60 text-slate-800 placeholder-slate-500 focus:ring-purple-400/50 focus:bg-white/80'
                        } disabled:opacity-50`}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || !isConnected}
                        className={`px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                          darkMode
                            ? 'bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg'
                            : 'bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg'
                        }`}
                      >
                        <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-4">
                  <div className="text-center space-y-4 opacity-0 animate-fadeIn">
                    <div className={`p-5 sm:p-6 rounded-3xl transition-colors duration-500 mx-auto w-fit ${
                      darkMode ? 'bg-slate-700/30' : 'bg-white/50'
                    }`}>
                      <MessageSquare className={`w-12 h-12 sm:w-16 sm:h-16 transition-colors duration-500 ${
                        darkMode ? 'text-purple-400' : 'text-purple-500'
                      }`} />
                    </div>
                    <div className="space-y-2">
                      <h3 className={`text-lg sm:text-xl font-semibold transition-colors duration-500 ${
                        darkMode ? 'text-white' : 'text-slate-800'
                      }`}>
                        {isConnected ? 'No Active Chat' : 'Disconnected from Server'}
                      </h3>
                      <p className={`text-sm sm:text-base px-4 transition-colors duration-500 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        {isConnected 
                          ? 'Accept a user from the waiting list to begin.' 
                          : 'Attempting to reconnect. You can also use the button below.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slideIn { animation: slideIn 0.4s ease-out forwards; }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out forwards; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: ${darkMode ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)'};
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${darkMode ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.4)'};
        }
      `}</style>
    </div>
  );
}

export default AdminPanel;
