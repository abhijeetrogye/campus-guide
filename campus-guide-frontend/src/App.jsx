import React, { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Send, Mic, MicOff, Volume2, Sparkles, MessageCircle, Languages, X, User, Star } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Generate a unique ID for the user session
const USER_ID = `user_${Math.random().toString(36).substr(2, 9)}`;

// Language options for translation and TTS
const languages = {
  'en': { name: 'English', voiceCode: 'en-US' },
  'hi': { name: 'हिन्दी (Hindi)', voiceCode: 'hi-IN' },
  'mr': { name: 'मराठी (Marathi)', voiceCode: 'mr-IN' },
  'es': { name: 'Español', voiceCode: 'es-ES' },
  'fr': { name: 'Français', voiceCode: 'fr-FR' },
};

function CampusChat() {
  const [darkMode, setDarkMode] = useState(true);
  const [targetLang, setTargetLang] = useState('en');
  const [listening, setListening] = useState(false);
  
  // Chat mode state
  const [isLiveChat, setIsLiveChat] = useState(false);
  
  // Separate states for AI chat and Live chat
  const [aiMessages, setAiMessages] = useState([]);
  const [liveMessages, setLiveMessages] = useState([]);
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mapUrl, setMapUrl] = useState(null);
  
  // Live Chat specific state
  const [ws, setWs] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, liveMessages, isLoading]);

  // Preload voices for text-to-speech
  useEffect(() => {
    window.speechSynthesis.getVoices();
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = languages[targetLang].voiceCode;

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        setListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setListening(false);
      };

      recognitionRef.current.onend = () => {
        setListening(false);
      };
    }
  }, [targetLang]);

  // WebSocket Connection Handler
  useEffect(() => {
    if (!isLiveChat) return;
    
    const socket = new WebSocket(`ws://127.0.0.1:8000/ws/livechat/user/${USER_ID}`);
    
    socket.onopen = () => {
      console.log('✅ User WebSocket Connected');
      setWs(socket);
      setIsConnected(true);
      socket.send(JSON.stringify({ type: 'request_chat' }));
      setLiveMessages(prev => [...prev, { 
        role: 'system', 
        content: "🔍 Connecting you to a guide, please wait..." 
      }]);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'chat_started':
            setLiveMessages(prev => {
              // Avoid duplicate "connected" messages
              if (prev.some(msg => msg.content.includes("A guide has connected"))) {
                return prev;
              }
              return [...prev, { 
                role: 'system', 
                content: "✅ A guide has connected! You can start chatting now." 
              }];
            });
            break;
            
          case 'message':
            setLiveMessages(prev => [...prev, { 
              role: 'model', 
              content: data.content 
            }]);
            break;
            
          case 'chat_ended':
            setLiveMessages(prev => [...prev, { 
              role: 'system', 
              content: "❌ The guide has ended the chat. Please leave your feedback." 
            }]);
            setShowFeedback(true);
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
            setWs(null);
            setIsConnected(false);
            break;
            
          case 'user_disconnected':
             setLiveMessages(prev => [...prev, { 
              role: 'system', 
              content: "⚠️ Connection lost. Please refresh to start over." 
            }]);
            break;
            
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.onclose = (event) => {
      console.log('🔌 User WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
      if (!showFeedback && event.code !== 1000) {
        setLiveMessages(prev => [...prev, { 
          role: 'system', 
          content: "⚠️ Connection lost. Please refresh to start over." 
        }]);
      }
    };

    socket.onerror = (error) => {
      console.error('❌ User WebSocket error:', error);
      setIsConnected(false);
    };

    // Cleanup function
    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Component unmounting');
      }
      setWs(null);
      setIsConnected(false);
    };
  }, [isLiveChat, showFeedback]);

  const handleSendMessage = async () => {
    const userMessage = inputValue.trim();
    if (!userMessage || isLoading) return;
    setInputValue('');

    if (isLiveChat) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        setLiveMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        ws.send(JSON.stringify({ type: 'message', content: userMessage }));
      } else {
        setLiveMessages(prev => [...prev, { 
          role: 'system', 
          content: "⚠️ Not connected. Please wait for connection..." 
        }]);
      }
    } else {
      const newUserMessage = { role: 'user', content: userMessage };
      setAiMessages(prev => [...prev, newUserMessage]);
      setIsLoading(true);
      setMapUrl(null);

      try {
        const response = await fetch('http://127.0.0.1:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            history: aiMessages,
            target_lang: targetLang,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.responseText.includes("Would you like to talk to a person?")) {
          setAiMessages(prev => [...prev, { 
            role: 'model', 
            content: data.responseText, 
            isEscalation: true 
          }]);
        } else {
          setAiMessages(prev => [...prev, { 
            role: 'model', 
            content: data.responseText 
          }]);
          if (data.mapUrl) {
            setMapUrl(data.mapUrl);
          }
        }
      } catch (error) {
        console.error("Failed to send message:", error);
        const errorResponse = { 
          role: 'model', 
          content: "Sorry, I'm having trouble connecting. Please check the backend server and try again." 
        };
        setAiMessages(prev => [...prev, errorResponse]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSpeak = (text, langCode) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = window.speechSynthesis.getVoices().find(v => v.lang === langCode);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.lang = langCode;
      utterance.pitch = 1;
      utterance.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Sorry, your browser doesn't support text-to-speech.");
    }
  };

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.lang = languages[targetLang].voiceCode;
        recognitionRef.current.start();
        setListening(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setListening(false);
      }
    }
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  const startLiveChat = () => {
    setIsLiveChat(true);
    setLiveMessages([]);
    setShowFeedback(false);
  };

  const exitLiveChat = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'User left chat');
    }
    setIsLiveChat(false);
    setWs(null);
    setIsConnected(false);
    setLiveMessages([]);
    setShowFeedback(false);
  };

  const handleFeedbackSubmitted = () => {
    setTimeout(() => {
        exitLiveChat();
    }, 2000);
  };

  const currentMessages = isLiveChat ? liveMessages : aiMessages;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'
    }`}>
      {/* Animated background elements */}
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
        <div className={`w-full max-w-4xl h-[95vh] rounded-3xl shadow-2xl backdrop-blur-xl transition-all duration-500 flex flex-col overflow-hidden ${
          darkMode 
            ? 'bg-slate-800/40 border border-slate-700/50' 
            : 'bg-white/70 border border-white/60'
        }`}>
          {/* Header */}
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
                    Campus Guide AI
                  </h1>
                  <p className={`text-xs sm:text-sm transition-colors duration-500 ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {isLiveChat 
                      ? `Live chat with guide ${isConnected ? '✅ Connected' : '🔌 Connecting...'}` 
                      : 'Your intelligent campus assistant'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {!isLiveChat && (
                  <>
                    <div className="relative">
                      <select
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className={`appearance-none cursor-pointer pl-8 pr-3 py-2 text-xs sm:text-sm rounded-xl outline-none transition-all duration-300 ${
                          darkMode 
                            ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-200' 
                            : 'bg-slate-200/50 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {Object.entries(languages).map(([code, { name }]) => (
                          <option key={code} value={code}>{name}</option>
                        ))}
                      </select>
                      <Languages className="w-3 h-3 sm:w-4 sm:h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none"/>
                    </div>

                    <button
                      onClick={startLiveChat}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-all duration-300 hover:scale-105 ${
                        darkMode 
                          ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' 
                          : 'bg-green-500/20 text-green-700 hover:bg-green-500/30'
                      }`}
                    >
                      <User className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Talk to Person</span>
                    </button>
                  </>
                )}

                {isLiveChat && (
                  <button
                    onClick={exitLiveChat}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-all duration-300 hover:scale-105 ${
                      darkMode 
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' 
                        : 'bg-red-500/20 text-red-700 hover:bg-red-500/30'
                    }`}
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Exit Chat</span>
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

          {/* Chat Window */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {currentMessages.length === 0 && !isLiveChat && (
              <div className="h-full flex flex-col items-center justify-center gap-4 sm:gap-6 opacity-0 animate-fadeIn">
                <div className={`p-5 sm:p-6 rounded-3xl transition-colors duration-500 ${
                  darkMode ? 'bg-slate-700/30' : 'bg-white/50'
                }`}>
                  <MessageCircle className={`w-12 h-12 sm:w-16 sm:h-16 transition-colors duration-500 ${
                    darkMode ? 'text-purple-400' : 'text-purple-500'
                  }`} />
                </div>
                <div className="text-center space-y-2">
                  <h2 className={`text-xl sm:text-2xl font-semibold transition-colors duration-500 ${
                    darkMode ? 'text-white' : 'text-slate-800'
                  }`}>
                    Welcome to Campus Guide AI
                  </h2>
                  <p className={`text-sm sm:text-base px-4 transition-colors duration-500 ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Ask me about courses, faculty, events, or anything campus-related
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3 justify-center max-w-md px-4">
                  {['Course schedules', 'Faculty info', 'Campus events', 'Facilities'].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInputValue(`Tell me about ${suggestion.toLowerCase()}`)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 hover:scale-105 ${
                        darkMode 
                          ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-300' 
                          : 'bg-white/60 hover:bg-white text-slate-700'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {currentMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-end gap-2 ${
                  msg.role === 'user' ? 'justify-end' : 
                  msg.role === 'system' ? 'justify-center' : 
                  'justify-start'
                } animate-slideIn`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {msg.role === 'system' ? (
                  <div className={`text-xs px-3 py-1 rounded-full ${
                    darkMode ? 'text-slate-400 bg-slate-700/50' : 'text-slate-600 bg-slate-300/50'
                  }`}>
                    {msg.content}
                  </div>
                ) : (
                  <>
                    <div className={`max-w-[85%] md:max-w-[70%] px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl transition-all duration-300 hover:scale-[1.02] ${
                      msg.role === 'user'
                        ? darkMode
                          ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-br-md shadow-lg'
                          : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-br-md shadow-lg'
                        : darkMode
                          ? 'bg-slate-700/50 text-slate-100 rounded-bl-md'
                          : 'bg-white/60 text-slate-800 rounded-bl-md'
                    }`}>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          components={{
                            p: ({node, ...props}) => <p className={`leading-relaxed text-sm sm:text-base ${msg.role === 'user' ? 'text-white' : darkMode ? 'text-slate-200' : 'text-slate-800'}`} {...props} />,
                            strong: ({node, ...props}) => <strong className={`font-semibold ${msg.role === 'user' ? 'text-white' : darkMode ? 'text-slate-100' : 'text-slate-900'}`} {...props} />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      {msg.isEscalation && (
                        <button 
                          onClick={startLiveChat}
                          className="mt-3 px-4 py-1.5 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 transition-all duration-300"
                        >
                          Yes, talk to a person
                        </button>
                      )}
                    </div>
                    {msg.role === 'model' && !isLiveChat && (
                      <button
                        onClick={() => handleSpeak(msg.content, languages[targetLang].voiceCode)}
                        className={`p-2 rounded-full transition-all duration-300 hover:scale-110 ${
                          darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-white/50'
                        }`}
                      >
                        <Volume2 className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start animate-slideIn">
                <div className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl rounded-bl-md ${
                  darkMode ? 'bg-slate-700/50' : 'bg-white/60'
                }`}>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full animate-bounce ${
                          darkMode ? 'bg-purple-400' : 'bg-purple-500'
                        }`}
                        style={{ animationDelay: `${i * 0.15}s` }}
                      ></div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showFeedback && <FeedbackForm sessionId={USER_ID} darkMode={darkMode} onFeedbackSubmitted={handleFeedbackSubmitted} />}
            
            <div ref={chatEndRef} />
          </div>

          {/* Map Display */}
          {mapUrl && !isLiveChat && (
            <div className={`relative p-3 sm:p-4 border-t transition-colors duration-500 ${
              darkMode ? 'border-slate-700/50' : 'border-slate-200/50'
            }`} style={{maxHeight: '35vh'}}>
              <div className="aspect-video rounded-xl overflow-hidden shadow-lg">
                <iframe
                  title="Campus Location"
                  src={mapUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>
              </div>
              <button
                onClick={() => setMapUrl(null)}
                className={`absolute top-5 sm:top-6 right-5 sm:right-6 p-1.5 rounded-full transition-all duration-300 hover:scale-110 ${
                  darkMode ? 'bg-slate-800/80 hover:bg-slate-700' : 'bg-white/80 hover:bg-gray-200'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input Area */}
          <div className={`p-3 sm:p-4 border-t transition-colors duration-500 ${
            darkMode ? 'border-slate-700/50 bg-slate-800/30' : 'border-slate-200/50 bg-white/30'
          }`}>
            <div className="flex gap-2 max-w-4xl mx-auto">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                  placeholder={
                    isLiveChat 
                      ? (isConnected ? "Type your message to the guide..." : "Connecting to guide...")
                      : "Ask me anything about campus..."
                  }
                  disabled={isLoading || (isLiveChat && !isConnected) || showFeedback}
                  className={`w-full px-4 sm:px-5 py-2.5 sm:py-3.5 text-sm sm:text-base rounded-2xl outline-none transition-all duration-300 focus:ring-2 ${
                    darkMode
                      ? 'bg-slate-700/50 text-white placeholder-slate-400 focus:ring-purple-500/50 focus:bg-slate-700/70'
                      : 'bg-white/60 text-slate-800 placeholder-slate-500 focus:ring-purple-400/50 focus:bg-white/80'
                  } disabled:opacity-50`}
                />
              </div>
              
              {!isLiveChat && (
                <button
                  onClick={handleMicClick}
                  disabled={isLoading || showFeedback}
                  className={`p-2.5 sm:p-3.5 rounded-2xl transition-all duration-300 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed ${
                    listening
                      ? 'bg-gradient-to-br from-red-500 to-pink-500 text-white shadow-lg animate-pulse'
                      : darkMode
                        ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                        : 'bg-white/60 hover:bg-white text-slate-700'
                  }`}
                >
                  {listening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              )}

              <button
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim() || (isLiveChat && !isConnected) || showFeedback}
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
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .animate-slideIn {
          animation: slideIn 0.4s ease-out forwards;
        }

        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out forwards;
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

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

function FeedbackForm({ sessionId, darkMode, onFeedbackSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (rating === 0) {
        setError("Please select a rating before submitting.");
        return;
    }
    setError(null);

    try {
      await fetch('http://127.0.0.1:8000/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, rating, comment }),
      });
      setSubmitted(true);
      onFeedbackSubmitted();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setError("Failed to submit feedback. Please try again.");
    }
  };

  if (submitted) {
    return (
      <div className={`text-center p-4 rounded-xl mt-4 ${darkMode ? 'bg-slate-700/50 text-green-400' : 'bg-green-100 text-green-700'}`}>
        Thank you for your feedback! Returning to the main chat...
      </div>
    );
  }

  return (
    <div className={`p-4 mt-4 rounded-xl border ${
      darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white/60 border-slate-300'
    }`}>
      <h4 className={`font-semibold text-center mb-2 ${
        darkMode ? 'text-white' : 'text-slate-800'
      }`}>
        How was your experience?
      </h4>
      <div className="flex justify-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star} onClick={() => setRating(star)}>
            <Star className={`w-6 h-6 transition-colors ${
              rating >= star ? 'text-yellow-400 fill-current' : darkMode ? 'text-slate-500' : 'text-slate-400'
            }`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Any additional comments? (optional)"
        className={`w-full h-16 p-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
          darkMode 
            ? 'bg-slate-800 text-white placeholder-slate-400' 
            : 'bg-white text-slate-800 placeholder-slate-500'
        }`}
      />
      {error && <p className="text-xs text-red-500 text-center mt-2">{error}</p>}
      <button 
        onClick={handleSubmit}
        className="w-full mt-2 py-2 bg-gradient-to-br from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all duration-300 disabled:opacity-50"
        disabled={rating === 0}
      >
        Submit Feedback
      </button>
    </div>
  );
}

export default CampusChat;
