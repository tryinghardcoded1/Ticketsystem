import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { MessageSquare, X, Mic, Send, MicOff, Loader2, Paperclip } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, deleteDoc, getDocs, Timestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { Rental, Ticket, Vehicle } from '../types';

interface Message {
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 preview
}

interface ChatbotProps {
  rentals: Rental[];
  tickets: Ticket[];
  vehicles: Vehicle[];
}

// Simple matching helper
function searchData(items: any[], term: string) {
  const lowerTerm = term.toLowerCase();
  return items.filter(item => {
    return Object.values(item).some(val => 
      val && String(val).toLowerCase().includes(lowerTerm)
    );
  }).slice(0, 10); // Limit to 10 results
}

export default function Chatbot({ rentals, tickets, vehicles }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Speech Recognition
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        handleSendMessage(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          setMessages(prev => [...prev, { role: 'model', text: 'Microphone access is not allowed. Please allow microphone permissions and try again.' }]);
        } else {
          setMessages(prev => [...prev, { role: 'model', text: `Microphone error: ${event.error}` }]);
        }
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFilePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const userMessage = typeof overrideText === 'string' ? overrideText.trim() : input.trim();
    if (!userMessage && !selectedFile) return;

    if (typeof overrideText !== 'string') {
      setInput('');
    }
    
    // Store preview for UI, then clear form
    const currentPreview = filePreview;
    const currentFile = selectedFile;
    
    setMessages(prev => [...prev, { role: 'user', text: userMessage || 'Analyzing image...', image: currentPreview || undefined }]);
    setSelectedFile(null);
    setFilePreview(null);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const searchRentalsTool: FunctionDeclaration = {
        name: 'searchRentals',
        description: 'Search the database of car rentals. Use this to find duplicate names, check a customer status, etc.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            searchTerm: { type: Type.STRING, description: 'Customer name, email, or plate number' }
          },
          required: ['searchTerm']
        }
      };

      const searchTicketsTool: FunctionDeclaration = {
        name: 'searchTickets',
        description: 'Search the database of traffic tickets/violations.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            searchTerm: { type: Type.STRING, description: 'Plate number or violation type' }
          },
          required: ['searchTerm']
        }
      };

      const createTicketTool: FunctionDeclaration = {
        name: 'createTicket',
        description: 'Creates a new ticket/violation or crash/accident record in the system. Use this when instructed to save an extracted document or crash report.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            plateNumber: { type: Type.STRING, description: 'Vehicle plate number (or UNKNOWN if not specified)' },
            violationDate: { type: Type.STRING, description: 'Date of violation or report (YYYY-MM-DD)' },
            amount: { type: Type.NUMBER, description: 'Fine or damage amount (set to 0 for crash reports)' },
            violationType: { type: Type.STRING, description: 'Type of violation (e.g. Speeding, Parking, Accident Report)' },
            documentType: { type: Type.STRING, description: 'Type of document (ticket or crash_report)' },
            driverName: { type: Type.STRING, description: 'Full name of driver if crash_report' },
            passengerName: { type: Type.STRING, description: 'Full name of passenger if crash_report' },
            injuryType: { type: Type.STRING, description: 'Injury type/indicator if crash_report' },
            activeRestraint: { type: Type.STRING, description: 'Active restraint details if crash_report' }
          },
          required: ['plateNumber', 'violationDate', 'amount', 'violationType']
        }
      };

      const deleteTicketTool: FunctionDeclaration = {
        name: 'deleteTicket',
        description: 'Deletes a ticket/violation record from the system. You must provide the ticket ID. Note: Deleting requires Admin permissions. Use searchTickets first to find the ticket ID if not known.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ticketId: { type: Type.STRING, description: 'The unique document ID of the ticket to delete' }
          },
          required: ['ticketId']
        }
      };

      const purgeAllTicketsTool: FunctionDeclaration = {
        name: 'purgeAllTickets',
        description: 'Permanently deletes ALL ticket/violation records from the system. Requires Admin permissions. Use when user explicitly asks to delete all tickets.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      };

      let localChat = chatRef.current;
      if (!localChat) {
        localChat = ai.chats.create({
          model: 'gemini-3.1-pro-preview',
          config: {
            systemInstruction: 'You are an operations Virtual Assistant (VA) helper for Philly Car rental. You can search rentals, search tickets, create new tickets, delete single tickets, and even delete/purge all tickets (if explicitly requested and user has admin permissions). Be concise and professional.',
            tools: [{ functionDeclarations: [searchRentalsTool, searchTicketsTool, createTicketTool, deleteTicketTool, purgeAllTicketsTool] }],
          }
        });
        chatRef.current = localChat;
      }

      let payload: any = { message: userMessage };
      
      if (currentFile && currentPreview) {
        const base64Data = currentPreview.split(',')[1];
        payload.message = [
          { text: userMessage || 'Extract the ticket details from this image.' },
          { inlineData: { mimeType: currentFile.type, data: base64Data } }
        ];
      }

      let response = await localChat.sendMessage(payload);
      
      // Handle function calling
      if (response.functionCalls && response.functionCalls.length > 0) {
        let functionCall = response.functionCalls[0];
        let apiResponse: any = {};
        
        if (functionCall.name === 'searchRentals') {
          const args = functionCall.args as any;
          const results = searchData(rentals, args.searchTerm || '');
          apiResponse = { results };
        } else if (functionCall.name === 'searchTickets') {
          const args = functionCall.args as any;
          const results = searchData(tickets, args.searchTerm || '');
          apiResponse = { results };
        } else if (functionCall.name === 'createTicket') {
          const args = functionCall.args as any;
          try {
            const dateObj = args.violationDate ? new Date(args.violationDate) : new Date();
            const parsedDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
            
            await addDoc(collection(db, 'tickets'), {
              plateNumber: args.plateNumber || 'UNKNOWN',
              violationDate: Timestamp.fromDate(parsedDate),
              amount: Number(args.amount) || 0,
              violationType: args.violationType || 'Unknown Violation',
              status: 'unpaid',
              createdAt: serverTimestamp(),
              documentType: args.documentType || 'ticket',
              driverName: args.driverName || '',
              passengerName: args.passengerName || '',
              injuryType: args.injuryType || '',
              activeRestraint: args.activeRestraint || ''
            }).catch(e => {
              handleFirestoreError(e, OperationType.CREATE, 'tickets');
              throw e;
            });
            apiResponse = { success: true, message: `Document recorded successfully for plate ${args.plateNumber || 'UNKNOWN'}` };
          } catch (e: any) {
            apiResponse = { success: false, error: e.message };
          }
        } else if (functionCall.name === 'deleteTicket') {
          const args = functionCall.args as any;
          try {
            // Delete notes subcollection first
            const notesSnapshot = await getDocs(collection(db, 'tickets', args.ticketId, 'notes'));
            const noteDeletePromises = notesSnapshot.docs.map(nDoc => deleteDoc(doc(db, 'tickets', args.ticketId, 'notes', nDoc.id)));
            await Promise.all(noteDeletePromises);

            await deleteDoc(doc(db, 'tickets', args.ticketId)).catch((e: any) => {
              handleFirestoreError(e, OperationType.DELETE, 'tickets');
              throw e;
            });
            apiResponse = { success: true, message: `Ticket ${args.ticketId} deleted.` };
          } catch (e: any) {
            apiResponse = { success: false, error: e.message || 'Permission denied. Ensure you are an Admin.' };
          }
        } else if (functionCall.name === 'purgeAllTickets') {
          try {
            const querySnapshot = await getDocs(collection(db, 'tickets'));
            const deletePromises = querySnapshot.docs.map(async (docSnap) => {
              // Delete notes subcollection first
              const notesSnapshot = await getDocs(collection(db, 'tickets', docSnap.id, 'notes'));
              const noteDeletePromises = notesSnapshot.docs.map(nDoc => deleteDoc(doc(db, 'tickets', docSnap.id, 'notes', nDoc.id)));
              await Promise.all(noteDeletePromises);

              return deleteDoc(doc(db, 'tickets', docSnap.id)).catch(e => {
                handleFirestoreError(e, OperationType.DELETE, 'tickets');
                throw e;
              });
            });
            await Promise.all(deletePromises);
            apiResponse = { success: true, message: `Successfully deleted all ${querySnapshot.size} tickets.` };
          } catch (e: any) {
            apiResponse = { success: false, error: e.message || 'Permission denied. Ensure you are an Admin.' };
          }
        }

        response = await localChat.sendMessage({ 
          message: JSON.stringify([{
             functionResponse: {
               name: functionCall.name,
               response: apiResponse
             }
          }])
        });
      }

      setMessages(prev => [...prev, { role: 'model', text: response.text || 'I could not process that request.' }]);

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please ensure your API key is configured.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const chatRef = useRef<any>(null);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-transform hover:scale-105 active:scale-95"
      >
        <MessageSquare size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <MessageSquare size={20} />
          <span className="font-semibold text-sm">VA Assistant</span>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="rounded-md p-1 hover:bg-white/20 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-4">
            <p>Hi! I can help you search records, extract tickets from images, and check for duplicates.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-3 text-sm flex flex-col gap-2 ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none' 
                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
            }`}>
              {msg.image && (
                <img src={msg.image} alt="Upload preview" className="w-full max-h-32 object-contain rounded-md" />
              )}
              {msg.text && <div>{msg.text}</div>}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1">
              <div className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce"></div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3 flex flex-col gap-2">
        {filePreview && (
          <div className="relative inline-block w-16 h-16 ml-2">
            <img src={filePreview} alt="upload" className="w-full h-full object-cover rounded-md border border-slate-200 shadow-sm" />
            <button 
              onClick={() => { setSelectedFile(null); setFilePreview(null); }}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <Paperclip size={18} />
          </button>
          
          <button
            onClick={toggleListen}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${
              isListening 
                ? 'bg-rose-100 text-rose-600 animate-pulse scale-105 shadow-inner' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={isListening ? "Listening... Speak now" : "Ask me anything..."}
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            disabled={isListening}
          />
          
          <button
            onClick={() => handleSendMessage()}
            disabled={(!input.trim() && !selectedFile) || isTyping || isListening}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send size={16} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
