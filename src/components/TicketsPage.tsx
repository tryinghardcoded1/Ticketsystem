import React from 'react';
import { 
  Upload, 
  Search, 
  Ticket as TicketIcon, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  ExternalLink,
  ShieldAlert,
  Loader2,
  X,
  User,
  MapPin,
  Calendar,
  DollarSign,
  ArrowRight,
  Eye,
  FileText,
  Edit2,
  Save,
  MessageSquare,
  Send,
  Trash2,
  Download
} from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, where, Timestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { cn, formatDate } from '../lib/utils';
import { Ticket, Rental } from '../types';
import { extractTicketData } from '../services/aiService';

import { createSpreadsheet, updateSheetValues } from '../services/sheetsService';

interface TicketsPageProps {
  userProfile?: any;
}

export default function TicketsPage({ userProfile }: TicketsPageProps) {
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const isStaffUser = userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN' || userProfile?.role === 'STAFF' || auth.currentUser?.email === 'license4booking@gmail.com' || auth.currentUser?.email === 'cerezvincent24@gmail.com';
  const isAdminUser = userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN' || auth.currentUser?.email === 'license4booking@gmail.com' || auth.currentUser?.email === 'cerezvincent24@gmail.com';
  const [loading, setLoading] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState({ current: 0, total: 0 });
  
  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    requiresInput?: string | null;
    inputValue?: string;
    confirmText?: string;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    requiresInput: null,
    inputValue: '',
    confirmText: 'Confirm',
    type: 'danger'
  });

  const [selectedTicket, setSelectedTicket] = React.useState<Ticket | null>(null);
  const [selectedTicketIds, setSelectedTicketIds] = React.useState<Set<string>>(new Set());
  const [rentals, setRentals] = React.useState<Rental[]>([]);
  const [rentalSearch, setRentalSearch] = React.useState('');
  const [isSearchingRentals, setIsSearchingRentals] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<Rental[]>([]);
  
  const [notes, setNotes] = React.useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = React.useState(false);
  const [noteText, setNoteText] = React.useState('');
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<Ticket['status'] | 'all'>('all');
  const [isEditing, setIsEditing] = React.useState(false);
  const [editData, setEditData] = React.useState<Partial<Ticket>>({});
  const [showImageViewer, setShowImageViewer] = React.useState(false);

  const fetchNotes = async (ticketId: string) => {
    setLoadingNotes(true);
    try {
      const q = query(
        collection(db, 'tickets', ticketId, 'notes'),
        orderBy('timestamp', 'asc')
      );
      const snapshot = await getDocs(q);
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `tickets/${ticketId}/notes`);
    } finally {
      setLoadingNotes(false);
    }
  };

  React.useEffect(() => {
    if (selectedTicket) {
      fetchNotes(selectedTicket.id);
      setEditData(selectedTicket);
      setIsEditing(false);
    } else {
      setNotes([]);
    }
  }, [selectedTicket]);

  const addNote = async () => {
    if (!selectedTicket || !noteText.trim()) return;
    try {
      const noteData = {
        text: noteText,
        author: auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      };
      const notesRef = collection(db, 'tickets', selectedTicket.id, 'notes');
      await addDoc(notesRef, noteData);
      setNoteText('');
      fetchNotes(selectedTicket.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tickets/${selectedTicket.id}/notes`);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!selectedTicket) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this internal comment? This action is permanent and cannot be undone.',
      confirmText: 'Delete Comment',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'tickets', selectedTicket.id, 'notes', noteId));
          setNotes(notes.filter(n => n.id !== noteId));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error: any) {
          console.error('Delete note error:', error);
          alert(`Could not delete note: ${error.message || 'Unknown error'}`);
        }
      }
    });
  };

  const startEditNote = (note: any) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const saveEditedNote = async () => {
    if (!selectedTicket || !editingNoteId || !editingNoteText.trim()) return;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicket.id, 'notes', editingNoteId), {
        text: editingNoteText,
        updatedAt: serverTimestamp()
      });
      setNotes(notes.map(n => n.id === editingNoteId ? { ...n, text: editingNoteText } : n));
      setEditingNoteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'note');
    }
  };

  const saveTicketEdits = async () => {
    if (!selectedTicket) return;
    try {
      // Validate types
      const updatePayload: any = {
        amount: Number(editData.amount),
        location: editData.location,
        plateNumber: editData.plateNumber,
        status: editData.status,
        make: editData.make,
        model: editData.model,
      };

      if (editData.violationDate) {
        // If it's a string from input date, convert to Timestamp
        const date = new Date(editData.violationDate instanceof Timestamp ? editData.violationDate.toDate() : editData.violationDate);
        updatePayload.violationDate = Timestamp.fromDate(date);
      }

      await updateDoc(doc(db, 'tickets', selectedTicket.id), updatePayload);
      
      const updatedTicket = { ...selectedTicket, ...updatePayload };
      setSelectedTicket(updatedTicket);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${selectedTicket.id}`);
    }
  };

  const fetchRentals = async () => {
    try {
      const q = query(collection(db, 'rentals'), orderBy('startDate', 'desc'));
      const snapshot = await getDocs(q);
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rental)));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'rentals');
    }
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ticket[];
      setTickets(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchTickets();
    fetchRentals();
  }, []);

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
    
    // Levenshtein distance
    const track = Array(c2.length + 1).fill(null).map(() =>
      Array(c1.length + 1).fill(null)
    );
    for (let i = 0; i <= c1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= c2.length; j += 1) track[j][0] = j;
    
    for (let j = 1; j <= c2.length; j += 1) {
      for (let i = 1; i <= c1.length; i += 1) {
        const indicator = c1[i - 1] === c2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1, // deletion
          track[j - 1][i] + 1, // insertion
          track[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    const distance = track[c2.length][c1.length];
    const maxLength = Math.max(c1.length, c2.length);
    return 1 - distance / maxLength;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      setUploadProgress({ current: 0, total: files.length });

      for (let i = 0; i < files.length; i++) {
        setUploadProgress(prev => ({ ...prev, current: i + 1 }));
        const file = files[i];

        try {
          // 1. AI Extraction
          const extracted = await extractTicketData(file);
          
          // 2. Automatch Renter
          const vDate = new Date(extracted.violationDate);
          const marginDays = 7;

          const potentialMatches = rentals.map(r => {
            const plateScore = fuzzyMatch(r.plateNumber, extracted.plateNumber || '');
            
            // Make/Model Score
            let makeModelScore = 0.5; // neutral default
            if (extracted.make || extracted.model) {
              const vehicleStr = (r.vehicle || '').toLowerCase();
              const extractedMake = (extracted.make || '').toLowerCase();
              const extractedModel = (extracted.model || '').toLowerCase();
              
              let matches = 0;
              let totalPossible = 0;
              if (extractedMake) {
                totalPossible++;
                if (vehicleStr.includes(extractedMake)) matches++;
              }
              if (extractedModel) {
                totalPossible++;
                if (vehicleStr.includes(extractedModel)) matches++;
              }
              if (totalPossible > 0) {
                makeModelScore = matches / totalPossible;
              }
            }

            const start = r.startDate.toDate();
            const end = r.endDate.toDate();
            
            // Wider date score: Allow up to 7 days before/after the rental period
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

            // Weighted score: Plate: 50%, Make/Model: 25%, Date: 25%
            const totalScore = (plateScore * 0.5) + (makeModelScore * 0.25) + (dateScore * 0.25);
            return {
              rentalId: r.id,
              customerName: r.customerName,
              plateNumber: r.plateNumber,
              vehicle: r.vehicle,
              confidence: totalScore
            };
          });

          // Sort and filter suggestions
          const suggestedMatches = potentialMatches
            .filter(m => m.confidence > 0.4)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

          let matchedCustomer = '';
          let rentalId = '';
          let matchConfidence = 0;

          if (suggestedMatches.length > 0 && suggestedMatches[0].confidence > 0.6) {
            matchedCustomer = suggestedMatches[0].customerName;
            rentalId = suggestedMatches[0].rentalId;
            matchConfidence = suggestedMatches[0].confidence;
          }

          // 3. Save Ticket
          await addDoc(collection(db, 'tickets'), {
            plateNumber: extracted.plateNumber,
            violationDate: Timestamp.fromDate(vDate),
            amount: extracted.amount,
            location: extracted.location || 'Unknown Location',
            violationType: extracted.violationType,
            make: extracted.make || null,
            model: extracted.model || null,
            matchedCustomer,
            rentalId,
            matchConfidence,
            suggestions: suggestedMatches,
            status: 'unpaid',
            createdAt: serverTimestamp(),
          }).catch(e => {
            handleFirestoreError(e, OperationType.CREATE, 'tickets');
            throw e;
          });
        } catch (err) {
          console.error(`Error processing file ${file.name}:`, err);
        }
      }

      setUploadModalOpen(false);
      fetchTickets();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tickets');
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const linkTicketToRental = async (ticketId: string, rental: Rental) => {
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        matchedCustomer: rental.customerName,
        rentalId: rental.id,
        suggestions: []
      });
      
      const updatedTicket = { 
        ...selectedTicket!, 
        matchedCustomer: rental.customerName, 
        rentalId: rental.id,
        suggestions: []
      };
      setSelectedTicket(updatedTicket);
      setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      setRentalSearch('');
      setSearchResults([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticketId}`);
    }
  };

  const handleRentalSearch = (val: string) => {
    setRentalSearch(val);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearchingRentals(true);
    const lower = val.toLowerCase();
    const filtered = rentals.filter(r => 
      r.customerName.toLowerCase().includes(lower) || 
      r.plateNumber.toLowerCase().includes(lower)
    ).slice(0, 5);
    
    setSearchResults(filtered);
    setIsSearchingRentals(false);
  };

  const removeLink = async () => {
    if (!selectedTicket) return;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        matchedCustomer: '',
        rentalId: '',
        suggestions: [] // Maybe clear suggestions if user is manually intervening?
      });
      const updatedTicket = { ...selectedTicket, matchedCustomer: '', rentalId: '', suggestions: [] };
      setSelectedTicket(updatedTicket);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `tickets/${selectedTicket.id}`);
    }
  };

  const updateTicketStatus = async (id: string, newStatus: Ticket['status']) => {
    try {
      await updateDoc(doc(db, 'tickets', id), { status: newStatus });
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      if (selectedTicket?.id === id) {
        setSelectedTicket(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
    }
  };

  const deleteTicket = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Violation Record',
      message: 'Are you sure you want to delete this traffic violation record? This action is permanent and cannot be undone.',
      confirmText: 'Delete Record',
      type: 'danger',
      onConfirm: async () => {
        try {
          // Delete all notes in the subcollection first
          const notesRef = collection(db, 'tickets', id, 'notes');
          const notesSnapshot = await getDocs(notesRef);
          const noteDeletePromises = notesSnapshot.docs.map(nDoc => deleteDoc(doc(db, 'tickets', id, 'notes', nDoc.id)));
          await Promise.all(noteDeletePromises);

          // Delete the main ticket document
          await deleteDoc(doc(db, 'tickets', id));
          setTickets(prev => prev.filter(t => t.id !== id));
          setSelectedTicket(null);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error: any) {
          console.error('Delete error:', error);
          alert(`Could not delete ticket: ${error.message || 'Unknown error'}`);
        }
      }
    });
  };

  const handleDeleteAll = async () => {
    if (!isStaffUser) {
      alert("Unauthorized: Only Staff/Admins can perform this action.");
      return;
    }
    if (tickets.length === 0) {
      alert("No tickets available to delete.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Purge ALL Violations',
      message: 'Are you absolutely sure you want to delete ALL traffic violations? This action is extremely destructive and cannot be undone.',
      requiresInput: 'DELETE ALL',
      inputValue: '',
      confirmText: 'Purge Systems',
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const qSnapshot = await getDocs(collection(db, 'tickets'));
          
          const batchPromises = qSnapshot.docs.map(async (docSnap) => {
            // Delete notes subcollection first
            const notesSnapshot = await getDocs(collection(db, 'tickets', docSnap.id, 'notes'));
            const notePromises = notesSnapshot.docs.map(nDoc => deleteDoc(doc(db, 'tickets', docSnap.id, 'notes', nDoc.id)));
            await Promise.all(notePromises);
            
            // Delete main document
            return deleteDoc(doc(db, 'tickets', docSnap.id));
          });
          
          await Promise.all(batchPromises);
          
          setTickets([]);
          setSelectedTicket(null);
          alert('All ticket records have been deleted successfully.');
        } catch (error: any) {
          console.error('Delete all error:', error);
          alert(`Could not delete tickets: ${error.message || 'Unknown error'}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (!isStaffUser) {
      alert("Unauthorized: Only Staff/Admins can perform this action.");
      return;
    }
    if (selectedTicketIds.size === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Violations',
      message: `Are you sure you want to delete the ${selectedTicketIds.size} selected ticket(s)? This action cannot be undone.`,
      confirmText: `Delete ${selectedTicketIds.size} Violations`,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const batchPromises = Array.from(selectedTicketIds).map(async (id) => {
            const ticketId = id as string;
            // Delete notes subcollection first
            const notesSnapshot = await getDocs(collection(db, 'tickets', ticketId, 'notes'));
            const notePromises = notesSnapshot.docs.map(nDoc => deleteDoc(doc(db, 'tickets', ticketId, 'notes', nDoc.id)));
            await Promise.all(notePromises);
            
            // Delete main document
            return deleteDoc(doc(db, 'tickets', ticketId));
          });
          await Promise.all(batchPromises);
          
          setTickets(tickets.filter(t => !selectedTicketIds.has(t.id)));
          if (selectedTicket && selectedTicketIds.has(selectedTicket.id)) {
            setSelectedTicket(null);
          }
          setSelectedTicketIds(new Set());
          alert(`Successfully deleted ${selectedTicketIds.size} ticket(s).`);
        } catch (error: any) {
          console.error('Bulk delete error:', error);
          alert(`Could not delete tickets: ${error.message || 'Unknown error'}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const exportToSheets = async () => {
    if (!filteredTickets.length) return;
    try {
      const title = `Traffic Violations Export - ${new Date().toLocaleDateString()}`;
      const spreadsheetId = await createSpreadsheet(title);
      
      const headers = ['Plate Number', 'Violation Date', 'Amount', 'Status', 'Renter', 'Location', 'Ticket #'];
      const rows = filteredTickets.map(t => [
        t.plateNumber,
        formatDate(t.violationDate),
        t.amount,
        t.status,
        t.matchedCustomer || 'Unmatched',
        t.location || 'Unknown',
        t.id
      ]);
      
      await updateSheetValues(spreadsheetId, 'Sheet1!A1', [headers, ...rows]);
      window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank');
    } catch (error: any) {
      alert('Export failed: ' + error.message);
    }
  };

  const filteredTickets = tickets.filter(t => 
    statusFilter === 'all' ? true : t.status === statusFilter
  );

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-slate-800">Traffic Violations</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <button 
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all",
                statusFilter === 'all' ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              All
            </button>
            <button 
              onClick={() => setStatusFilter('unpaid')}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all",
                statusFilter === 'unpaid' ? "bg-rose-600 text-white border-rose-600" : "bg-white text-rose-500 border-rose-100 hover:bg-rose-50"
              )}
            >
              Unpaid
            </button>
            <button 
              onClick={() => setStatusFilter('paid')}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all",
                statusFilter === 'paid' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-emerald-500 border-emerald-100 hover:bg-emerald-50"
              )}
            >
              Paid
            </button>
            <button 
              onClick={() => setStatusFilter('contested')}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all",
                statusFilter === 'contested' ? "bg-amber-600 text-white border-amber-600" : "bg-white text-amber-500 border-amber-100 hover:bg-amber-50"
              )}
            >
              Contested
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isStaffUser && selectedTicketIds.size > 0 && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleBulkDelete(); }}
              className="bg-rose-600 border border-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-700 transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Delete Selected ({selectedTicketIds.size})
            </button>
          )}
          {isStaffUser && tickets.length > 0 && selectedTicketIds.size === 0 && (
            <button 
              onClick={handleDeleteAll}
              className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Delete All
            </button>
          )}
          <button 
            onClick={exportToSheets}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Export to Sheets
          </button>
          <button 
            onClick={() => setUploadModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            New Violation
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {isStaffUser && (
                  <th className="px-4 py-3 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                      checked={filteredTickets.length > 0 && selectedTicketIds.size === filteredTickets.length}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                          setSelectedTicketIds(new Set(filteredTickets.map(t => t.id)));
                        } else {
                          setSelectedTicketIds(new Set());
                        }
                      }}
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Plate Number</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Violation Date</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Violation Type</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Amount</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Renter Match</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isStaffUser ? 8 : 7} className="px-4 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="animate-spin" size={32} />
                      <p className="text-sm font-bold">Loading records...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredTickets.length > 0 ? (
                filteredTickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    onClick={() => setSelectedTicket(ticket)}
                    className={cn(
                      "border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer",
                      selectedTicket?.id === ticket.id && "bg-indigo-50/50"
                    )}
                  >
                    {isStaffUser && (
                      <td className="px-4 py-4 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                          checked={selectedTicketIds.has(ticket.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newSet = new Set(selectedTicketIds);
                            if (e.target.checked) {
                              newSet.add(ticket.id);
                            } else {
                              newSet.delete(ticket.id);
                            }
                            setSelectedTicketIds(newSet);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded px-1.5 tracking-wider uppercase">
                        {ticket.plateNumber || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-700">
                      {formatDate(ticket.violationDate)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-700">
                      {ticket.violationType || 'Unknown'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-rose-600">
                      ${ticket.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={cn(
                        "rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest inline-block",
                        ticket.status === 'unpaid' ? "bg-rose-100 text-rose-700 border border-rose-200" : 
                        ticket.status === 'paid' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                        "bg-slate-100 text-slate-500 border border-slate-200"
                      )}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {ticket.matchedCustomer ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                            <CheckCircle2 size={16} />
                            <span>{ticket.matchedCustomer}</span>
                          </div>
                          {ticket.matchConfidence && (
                            <span className="text-[10px] text-slate-400 ml-5">
                              {Math.round(ticket.matchConfidence * 100)}% match
                            </span>
                          )}
                        </div>
                      ) : ticket.suggestions && ticket.suggestions.length > 0 ? (
                        <div className="flex items-center gap-1.5 text-sm font-bold text-amber-600">
                          <AlertCircle size={16} />
                          <span>{ticket.suggestions.length} Suggestions</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-400">
                          <X size={16} />
                          <span>No Match</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors inline-flex">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isStaffUser ? 8 : 7} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
                      <div className="rounded-full bg-slate-50 p-4 text-slate-300">
                        <TicketIcon size={32} />
                      </div>
                      <p className="text-sm font-bold">No violation records found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket Detail Drawer */}
      <AnimatePresence>
        {selectedTicket && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTicket(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-[70] border-l border-slate-200 flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    selectedTicket.status === 'unpaid' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    <TicketIcon size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Violation Details</h2>
                    <p className="text-xs text-slate-400 font-mono">PLATE: {selectedTicket.plateNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (isEditing) {
                        saveTicketEdits();
                      } else {
                        setIsEditing(true);
                      }
                    }}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      isEditing ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {isEditing ? <Save size={18} /> : <Edit2 size={18} />}
                  </button>
                  <button 
                    onClick={() => setSelectedTicket(null)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {isEditing ? (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edit Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Amount ($)</label>
                        <input 
                          type="number"
                          value={editData.amount}
                          onChange={(e) => setEditData({ ...editData, amount: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Plate Number</label>
                        <input 
                          type="text"
                          value={editData.plateNumber}
                          onChange={(e) => setEditData({ ...editData, plateNumber: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Make</label>
                        <input 
                          type="text"
                          value={editData.make || ''}
                          onChange={(e) => setEditData({ ...editData, make: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Model</label>
                        <input 
                          type="text"
                          value={editData.model || ''}
                          onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Violation Date</label>
                        <input 
                          type="date"
                          value={editData.violationDate ? (editData.violationDate instanceof Timestamp ? editData.violationDate.toDate() : new Date(editData.violationDate)).toISOString().split('T')[0] : ''}
                          onChange={(e) => setEditData({ ...editData, violationDate: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Location</label>
                        <input 
                          type="text"
                          value={editData.location || ''}
                          onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Core Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar size={14} className="text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900">{formatDate(selectedTicket.violationDate)}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign size={14} className="text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</span>
                        </div>
                        <p className="text-sm font-bold text-rose-600">${selectedTicket.amount.toFixed(2)}</p>
                      </div>
                      {(selectedTicket.make || selectedTicket.model) && (
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl col-span-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ShieldAlert size={14} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detected Vehicle</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900">
                            {selectedTicket.make || ''} {selectedTicket.model || ''}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={14} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{selectedTicket.location || 'Philadelphia, PA'}</p>
                    </div>
                  </>
                )}

                {/* Match Info */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User size={12} /> Renter Attribution
                  </h3>
                  
                  {selectedTicket.matchedCustomer ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase">Confirmed Match</p>
                          <p className="text-base font-bold text-slate-900">{selectedTicket.matchedCustomer}</p>
                        </div>
                      </div>
                      <button 
                        onClick={removeLink}
                        className="p-2 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-lg transition-colors"
                        title="Remove Link"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="text-amber-500" size={20} />
                        <p className="text-sm font-bold text-amber-900">Unattributed Violation</p>
                      </div>

                      {/* Manual Search */}
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <Search size={14} />
                        </div>
                        <input 
                          type="text"
                          placeholder="Search renter by name or plate..."
                          value={rentalSearch}
                          onChange={(e) => handleRentalSearch(e.target.value)}
                          className="w-full bg-white border border-amber-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      </div>

                      {searchResults.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-amber-200">
                          <p className="text-[9px] font-bold text-amber-600 uppercase">Search Results</p>
                          {searchResults.map(r => (
                            <button 
                              key={r.id}
                              onClick={() => linkTicketToRental(selectedTicket.id, r)}
                              className="w-full flex items-center justify-between p-3 bg-white hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors"
                            >
                              <div className="text-left">
                                <p className="text-xs font-bold text-slate-900">{r.customerName}</p>
                                <p className="text-[9px] text-slate-400 font-mono">PLATE: {r.plateNumber}</p>
                              </div>
                              <ArrowRight size={14} className="text-amber-400" />
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {selectedTicket.suggestions && selectedTicket.suggestions.length > 0 && searchResults.length === 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-amber-600 uppercase mb-3 text-center">AI Potential Matches</p>
                          <div className="grid grid-cols-1 gap-2">
                            {selectedTicket.suggestions.map((s) => (
                              <button 
                                key={s.rentalId}
                                onClick={() => {
                                  const rental = rentals.find(r => r.id === s.rentalId);
                                  if (rental) linkTicketToRental(selectedTicket.id, rental);
                                }}
                                className="w-full flex items-center justify-between p-3 bg-white hover:bg-amber-100/50 rounded-xl border border-amber-200 transition-colors"
                              >
                                <div className="text-left">
                                  <p className="text-xs font-bold text-slate-900">{s.customerName}</p>
                                  <p className="text-[9px] text-slate-400 font-mono tracking-tighter">PLATE: {s.plateNumber}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-amber-600">{Math.round(s.confidence * 100)}% Match</span>
                                  <ArrowRight size={14} className="text-amber-400" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!rentalSearch && (!selectedTicket.suggestions || selectedTicket.suggestions.length === 0) && (
                        <div className="text-center py-4 text-amber-600 text-xs font-medium">
                          AI could not confidently find a renter. Use the search above to link manually.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Evidence */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={12} /> Violation Evidence
                  </h3>
                  <div className="aspect-[16/10] bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400 overflow-hidden relative group">
                    <ShieldAlert size={48} className="opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/20 backdrop-blur-[2px]">
                       <button 
                        onClick={() => setShowImageViewer(true)}
                        className="bg-white px-4 py-2 rounded-xl text-xs font-bold text-slate-900 shadow-xl flex items-center gap-2"
                       >
                         <Eye size={16} /> View Scan
                       </button>
                    </div>
                  </div>
                </div>

                {/* Internal Notes */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare size={12} /> Internal Notes
                  </h3>
                  
                    <div className="space-y-3">
                      {loadingNotes ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="animate-spin text-slate-300" size={16} />
                        </div>
                      ) : notes.length > 0 ? (
                        notes.map((note) => (
                          <div key={note.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 group">
                            {editingNoteId === note.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingNoteText}
                                  onChange={(e) => setEditingNoteText(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none min-h-[60px]"
                                />
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditingNoteId(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                                  <button onClick={saveEditedNote} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700">Save</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-xs text-slate-700 leading-relaxed">{note.text}</p>
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-indigo-400 uppercase">{note.author.split('@')[0]}</span>
                                    <span className="text-[9px] text-slate-400 font-medium">{formatDate(note.timestamp)}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEditNote(note)} className="p-1 text-slate-300 hover:text-indigo-500 transition-colors">
                                      <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => deleteNote(note.id)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors">
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      ) : (
                      <p className="text-[10px] text-slate-400 text-center py-2">No internal notes yet.</p>
                    )}
                  </div>

                  <div className="relative mt-4">
                    <input 
                      type="text"
                      placeholder="Add an internal note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addNote()}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button 
                      onClick={addNote}
                      disabled={!noteText.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <select 
                    value={selectedTicket.status}
                    onChange={(e) => updateTicketStatus(selectedTicket.id, e.target.value as Ticket['status'])}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="unpaid">Mark as Unpaid</option>
                    <option value="paid">Mark as Paid</option>
                    <option value="contested">Mark as Contested</option>
                  </select>
                  <button 
                    onClick={() => deleteTicket(selectedTicket.id)}
                    className="p-3 bg-white border border-slate-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
             <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="font-bold text-sm tracking-tight uppercase">AI Violation Discovery</h4>
                    <p className="text-[10px] text-slate-400 font-medium">Automatic OCR & Fleet Match</p>
                  </div>
                </div>
                <button onClick={() => setUploadModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                  <X size={20} />
                </button>
             </div>
             
             <div className="p-6 space-y-6">
                <label className={cn(
                  "border-2 border-dashed border-slate-200 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center bg-slate-50 group hover:border-indigo-400 transition-all cursor-pointer",
                  isUploading && "pointer-events-none opacity-50"
                )}>
                  {isUploading ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-4">
                      <div className="relative">
                        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-indigo-600">
                            {uploadProgress.current}/{uploadProgress.total}
                          </span>
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="block text-sm font-bold text-indigo-900 uppercase">
                          Processing Batch {uploadProgress.current}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">
                          Fusing OCR and Renter DB...
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-indigo-500" />
                      </div>
                      <span className="text-sm font-bold text-slate-700">Drop violation scans or click</span>
                      <span className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest text-center">
                        Select multiple images for batch processing
                      </span>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                </label>

                <div className="grid grid-cols-2 gap-3 pb-4 sm:pb-0">
                   <div className="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                     <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0 font-bold text-indigo-600 text-xs">1</div>
                     <div className="flex-1 min-w-0">
                       <p className="text-[10px] font-bold text-indigo-900 uppercase">Snapshot OCR</p>
                       <p className="text-[9px] text-indigo-600 truncate">Vision AI reads plate</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                     <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0 font-bold text-indigo-600 text-xs">2</div>
                     <div className="flex-1 min-w-0">
                       <p className="text-[10px] font-bold text-indigo-900 uppercase">Fleet Sync</p>
                       <p className="text-[9px] text-indigo-600 truncate">Match with rentals</p>
                     </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}
      {/* Image Viewer Overlay */}
      <AnimatePresence>
        {showImageViewer && selectedTicket && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md"
            onClick={() => setShowImageViewer(false)}
          >
            <div className="relative max-w-4xl w-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
               <div className="w-full flex items-center justify-between text-white mb-2">
                 <div className="flex items-center gap-3">
                    <ShieldAlert className="text-rose-500" />
                    <div>
                      <h3 className="font-bold">Violation Snapshot</h3>
                      <p className="text-xs text-slate-400 font-mono">{selectedTicket.plateNumber} • {formatDate(selectedTicket.violationDate)}</p>
                    </div>
                 </div>
                 <button 
                  onClick={() => setShowImageViewer(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                 >
                   <X size={24} />
                 </button>
               </div>
               <div className="bg-white rounded-2xl p-2 shadow-2xl overflow-hidden group relative">
                 {selectedTicket.ticketImage ? (
                   <img 
                    src={selectedTicket.ticketImage} 
                    alt="Ticket Violation" 
                    className="max-h-[80vh] w-auto object-contain rounded-xl"
                   />
                 ) : (
                   <div className="w-[600px] max-w-full aspect-[4/3] bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-4">
                      <ShieldAlert size={64} className="opacity-20" />
                      <p className="text-sm font-bold">Ticket scan evidence currently in processing...</p>
                   </div>
                 )}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    confirmModal.type === 'danger' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                  )}>
                    <Trash2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{confirmModal.message}</p>
                  </div>
                </div>

                {confirmModal.requiresInput && (
                  <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Type "{confirmModal.requiresInput}" to confirm
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={`Type ${confirmModal.requiresInput}`}
                      value={confirmModal.inputValue || ''}
                      onChange={(e) => setConfirmModal(prev => ({ ...prev, inputValue: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!!confirmModal.requiresInput && confirmModal.inputValue !== confirmModal.requiresInput}
                  onClick={confirmModal.onConfirm}
                  className={cn(
                    "px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
                    confirmModal.type === 'danger' ? "bg-rose-600" : "bg-indigo-600"
                  )}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

