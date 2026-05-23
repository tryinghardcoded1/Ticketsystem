import React from 'react';
import { collection, addDoc, serverTimestamp, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { Upload, X, CheckCircle2, ShieldAlert, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function TicketUploadPage() {
  const [images, setImages] = React.useState<{
    id: string, 
    file: File, 
    dataUrl: string, 
    status: 'pending' | 'uploading' | 'analyzing' | 'success' | 'error', 
    extractedData?: any, 
    errorMsg?: string,
    matchConfidence?: number,
    suggestedMatches?: { rentalId: string, customerName: string, confidence: number }[]
  }[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = async (files: File[]) => {
    const validFiles = files.filter(f => f.type.startsWith('image/'));
    
    for (const file of validFiles) {
      // Compress image to avoid 1MB Firestore limit
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // heavily compressed

          setImages(prev => [...prev, {
            id: Math.random().toString(36).substring(7),
            file,
            dataUrl,
            status: 'pending'
          }]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const processAll = async () => {
    for (const img of images) {
      if (img.status === 'pending' || img.status === 'error') {
        await processSingleImage(img.id);
      }
    }
  };

  const normalizePlate = (plate: string) => {
    return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/B/g, '8')
      .replace(/G/g, '6');
  };

  const fuzzyMatch = (s1: string, s2: string) => {
    const c1 = normalizePlate(s1);
    const c2 = normalizePlate(s2);
    
    if (!c1 || !c2) return 0;
    if (c1 === c2) return 1.0;
    if (c1.includes(c2) && c2.length >= 4) return 0.85;
    if (c2.includes(c1) && c1.length >= 4) return 0.85;
    
    const track = Array(c2.length + 1).fill(null).map(() => Array(c1.length + 1).fill(null));
    for (let i = 0; i <= c1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= c2.length; j += 1) track[j][0] = j;
    
    for (let j = 1; j <= c2.length; j += 1) {
      for (let i = 1; i <= c1.length; i += 1) {
        const indicator = c1[i - 1] === c2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
      }
    }
    const distance = track[c2.length][c1.length];
    return 1 - distance / Math.max(c1.length, c2.length);
  };

  const processSingleImage = async (id: string) => {
    const imgData = images.find(i => i.id === id);
    if (!imgData) return;

    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'analyzing' } : img));

    try {
      // 1. Ask Backend AI to extract
      const aiResponse = await fetch('/api/extract-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [imgData.dataUrl] })
      });

      if (!aiResponse.ok) throw new Error("AI Extraction failed");
      
      const extracted = await aiResponse.json();

      setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'uploading', extractedData: extracted } : img));

      // 2. See if we can match a customer/rental
      let matchedCustomer = 'Unknown';
      let rentalId = '';
      let matchConfidence = 0;
      let suggestedMatches: { rentalId: string, customerName: string, confidence: number }[] = [];

      if (extracted.plate_number || extracted.driver_name) {
        try {
          const q = query(collection(db, 'rentals')); // Get all to fuzzy match
          const rentalsSnap = await getDocs(q).catch(e => {
            handleFirestoreError(e, OperationType.LIST, 'rentals');
            throw e;
          });
          const vDate = extracted.violation_date ? new Date(extracted.violation_date) : new Date();
          const marginDays = 14; // broader margin for accident/incident report matches
          
          const potentialMatches = rentalsSnap.docs.map(doc => {
            const rData = doc.data();
            const start = rData.startDate.toDate();
            const end = rData.endDate.toDate();
            
            // Fuzzy plate score
            const plateScore = extracted.plate_number ? fuzzyMatch(rData.plateNumber, extracted.plate_number) : 0;
            
            // Fuzzy name score (match customerName with driver_name)
            let nameScore = 0;
            if (extracted.driver_name && rData.customerName) {
              const nd1 = extracted.driver_name.toLowerCase().replace(/[^a-z]/g, '');
              const nc = rData.customerName.toLowerCase().replace(/[^a-z]/g, '');
              if (nd1 === nc || nc.includes(nd1) || nd1.includes(nc)) {
                nameScore = 1.0;
              } else {
                const distScore = fuzzyMatch(extracted.driver_name, rData.customerName);
                nameScore = distScore > 0.4 ? distScore : 0;
              }
            }
            
            // Wider date score: Allow up to 14 days before/after rental period
            const vDateMin = new Date(start.getTime() - marginDays * 24 * 60 * 60 * 1000);
            const vDateMax = new Date(end.getTime() + marginDays * 24 * 60 * 60 * 1000);

            let dateScore = 0;
            if (vDate >= start && vDate <= end) {
              dateScore = 1.0;
            } else if (vDate >= vDateMin && vDate <= vDateMax) {
              const diffMs = vDate < start ? start.getTime() - vDate.getTime() : vDate.getTime() - end.getTime();
              const diffDays = diffMs / (1000 * 60 * 60 * 24);
              dateScore = 0.9 * (1 - diffDays / marginDays);
            }
            
            // Weight Plate: 70%, Date: 30% or Name: 70%, Date: 30%
            const matchScore = (extracted.plate_number && extracted.plate_number !== 'UNKNOWN') ? plateScore : nameScore;
            const totalScore = (matchScore * 0.7) + (dateScore * 0.3);
            return {
              rentalId: doc.id,
              customerName: rData.customerName,
              confidence: totalScore
            };
          });

          // Sort and filter suggestions
          suggestedMatches = potentialMatches
            .filter(m => m.confidence > 0.3)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 3); // Top 3 suggestions

          if (suggestedMatches.length > 0 && suggestedMatches[0].confidence > 0.5) {
            matchedCustomer = suggestedMatches[0].customerName;
            rentalId = suggestedMatches[0].rentalId;
            matchConfidence = suggestedMatches[0].confidence;
          }
        } catch (matchError) {
          console.warn("Could not match customer to rental (permission denied or error). Continuing anyway...", matchError);
        }
      }

      const matchSuccess = suggestedMatches.length > 0 && suggestedMatches[0].confidence > 0.5;

      // 3. Save to Firestore tickets collection
      const ticketPayload = {
        plateNumber: extracted.plate_number || 'UNKNOWN',
        violationDate: extracted.violation_date ? Timestamp.fromDate(new Date(extracted.violation_date)) : serverTimestamp(),
        amount: Number(extracted.amount) || 0,
        violationType: extracted.violation_type || 'Unknown Violation',
        state: extracted.state || '',
        matchedCustomer,
        rentalId,
        matchConfidence,
        suggestions: suggestedMatches,
        status: matchSuccess ? 'matched' : 'unmatched',
        ticketImage: imgData.dataUrl,
        createdAt: serverTimestamp(),
        
        // Crash/Accident details
        documentType: extracted.document_type || 'ticket',
        driverName: extracted.driver_name || '',
        passengerName: extracted.passenger_name || '',
        injuryType: extracted.injury_type || '',
        activeRestraint: extracted.active_restraint || '',
      };

      await addDoc(collection(db, 'tickets'), ticketPayload).catch(e => {
        handleFirestoreError(e, OperationType.CREATE, 'tickets');
        throw e;
      });

      setImages(prev => prev.map(img => img.id === id ? { 
        ...img, 
        status: 'success', 
        matchConfidence,
        suggestedMatches
      } : img));

    } catch (err: any) {
      console.error("Processing error:", err);
      let errorMsg = 'Failed to process';
      if (err.message?.includes('permission')) {
        errorMsg = 'Insufficient Permission to save ticket.';
      } else if (err.message && err.message.length < 100) {
        errorMsg = err.message;
      }
      setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'error', errorMsg } : img));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="text-indigo-600" />
            Upload Tickets
          </h1>
          <p className="text-sm text-slate-500 mt-1">AI will automatically extract details and match to rentals.</p>
        </div>

        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'}
          `}
        >
          <input type="file" multiple accept="image/*" className="hidden" id="ticket-upload" onChange={handleFileSelect} />
          <label htmlFor="ticket-upload" className="flex flex-col items-center cursor-pointer w-full h-full">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400 group-hover:text-indigo-500 transition-colors">
              <Upload size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Drag & Drop tickets here</h3>
            <p className="text-sm text-slate-500 mt-2">or click to browse files</p>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6">Supports JPG, PNG</span>
          </label>
        </div>

        <div className="space-y-4">
          <AnimatePresence>
            {images.map((img) => (
              <motion.div 
                key={img.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row gap-6 items-start sm:items-center"
              >
                <div className="w-full sm:w-32 h-32 bg-slate-100 rounded-xl overflow-hidden shrink-0 relative group">
                  <img src={img.dataUrl} alt="Ticket preview" className="w-full h-full object-cover" />
                  {img.status !== 'success' && img.status !== 'analyzing' && img.status !== 'uploading' && (
                    <button 
                      onClick={() => removeImage(img.id)}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg text-rose-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-800 truncate pr-4">{img.file.name}</h4>
                    {img.status === 'success' && <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><CheckCircle2 size={12}/> Done</span>}
                    {img.status === 'analyzing' && <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md"><Loader2 size={12} className="animate-spin"/> Extracting</span>}
                    {img.status === 'uploading' && <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md"><Loader2 size={12} className="animate-spin"/> Saving</span>}
                    {img.status === 'error' && <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-rose-600 bg-rose-50 px-2 py-1 rounded-md"><AlertCircle size={12}/> Error</span>}
                    {img.status === 'pending' && <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Pending</span>}
                  </div>

                  {img.status === 'success' && img.extractedData && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                      <div><span className="text-slate-400 block mb-1">Plate:</span> <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{img.extractedData.plate_number || 'UNKNOWN'}</span></div>
                      <div><span className="text-slate-400 block mb-1">Date:</span> <span className="font-bold text-slate-700">{img.extractedData.violation_date || 'N/A'}</span></div>
                      <div><span className="text-slate-400 block mb-1">Amount:</span> <span className="font-bold text-rose-600">${Number(img.extractedData.amount || 0).toFixed(2)}</span></div>
                      
                      {img.extractedData.document_type === 'crash_report' && (
                        <div className="col-span-full border-t border-dashed border-slate-100 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {img.extractedData.driver_name && (
                            <div>
                              <span className="text-slate-400 block mb-1">Driver:</span>
                              <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{img.extractedData.driver_name}</span>
                            </div>
                          )}
                          {img.extractedData.passenger_name && (
                            <div>
                              <span className="text-slate-400 block mb-1">Passenger:</span>
                              <span className="font-bold text-slate-700">{img.extractedData.passenger_name}</span>
                            </div>
                          )}
                          {img.extractedData.injury_type && (
                            <div>
                              <span className="text-slate-400 block mb-1">Injury Type:</span>
                              <span className="font-bold text-amber-700">{img.extractedData.injury_type}</span>
                            </div>
                          )}
                          {img.extractedData.active_restraint && (
                            <div>
                              <span className="text-slate-400 block mb-1">Active Restraint:</span>
                              <span className="font-bold text-slate-600">{img.extractedData.active_restraint}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {img.matchConfidence !== undefined && (
                        <div className="col-span-full pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-400">Match Confidence:</span>
                            <span className={cn(
                              "font-bold",
                              img.matchConfidence > 0.8 ? "text-emerald-600" : img.matchConfidence > 0.6 ? "text-amber-600" : "text-rose-600"
                            )}>
                              {Math.round(img.matchConfidence * 100)}%
                            </span>
                          </div>
                          
                          {img.suggestedMatches && img.suggestedMatches.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Suggested Customers</p>
                              {img.suggestedMatches.map((match, idx) => (
                                <div key={match.rentalId} className={cn(
                                  "flex items-center justify-between p-2 rounded-lg border",
                                  idx === 0 ? "bg-indigo-50 border-indigo-100" : "bg-slate-50 border-slate-100"
                                )}>
                                  <span className="font-bold text-slate-700 truncate mr-2">{match.customerName}</span>
                                  <span className="text-[10px] text-slate-500 shrink-0">{Math.round(match.confidence * 100)}% Match</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-400 italic">No strong rental matches found.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {img.errorMsg && (
                    <p className="text-xs text-rose-500 font-medium">{img.errorMsg}</p>
                  )}
                </div>

                <div className="w-full sm:w-auto">
                    {img.status === 'pending' || img.status === 'error' ? (
                       <button 
                        onClick={() => processSingleImage(img.id)}
                        className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                      >
                       Process Now
                      </button>
                    ) : null}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {images.some(i => i.status === 'pending' || i.status === 'error') && (
          <div className="flex justify-end pt-4">
            <button 
              onClick={processAll}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors"
            >
              Process All Pending Documents
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
