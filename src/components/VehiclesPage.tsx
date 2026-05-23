import React from 'react';
import { 
  Car, 
  Settings, 
  Plus, 
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Wrench,
  ChevronRight,
  Trash2,
  X,
  UploadCloud,
  AlertCircle,
  FileCheck,
  Download,
  Database
} from 'lucide-react';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { cn } from '../lib/utils';
import { Vehicle } from '../types';
import { fetchSheetData, extractIdFromUrl } from '../services/sheetsService';
import { mapImportColumns } from '../services/aiService';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');

  const [selectedVehicleIds, setSelectedVehicleIds] = React.useState<Set<string>>(new Set());

  // Vehicle Modal States
  const [isVehicleModalOpen, setIsVehicleModalOpen] = React.useState(false);
  const [editingVehicleId, setEditingVehicleId] = React.useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = React.useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    plateNumber: '',
    color: '',
    status: 'available' as Vehicle['status'],
    registrant: '',
    lienholder: '',
    notes: ''
  });

  // Import States
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importText, setImportText] = React.useState('');
  const [isImporting, setIsImporting] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState('');
  const [shouldClearBeforeImport, setShouldClearBeforeImport] = React.useState(false);
  const [sheetsUrl, setSheetsUrl] = React.useState('');
  const [isSyncingSheets, setIsSyncingSheets] = React.useState(false);

  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    type: 'danger'
  });

  const toggleSelectVehicle = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedVehicleIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedVehicleIds(next);
  };

  const toggleSelectAllVehicles = () => {
    const filtered = vehicles.filter(v => 
      v.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filtered.length === 0) return;
    if (selectedVehicleIds.size === filtered.length) {
      setSelectedVehicleIds(new Set());
    } else {
      setSelectedVehicleIds(new Set(filtered.map(v => v.id)));
    }
  };

  const handleBulkDeleteVehicles = async () => {
    if (selectedVehicleIds.size === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Vehicles',
      message: `Are you sure you want to delete the ${selectedVehicleIds.size} selected vehicle(s) from the fleet? This action is permanent and cannot be undone.`,
      confirmText: `Delete ${selectedVehicleIds.size} Vehicles`,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const batchPromises = (Array.from(selectedVehicleIds) as string[]).map((id) => deleteDoc(doc(db, 'vehicles', id)));
          await Promise.all(batchPromises);

          setVehicles(prev => prev.filter(v => !selectedVehicleIds.has(v.id)));
          setSelectedVehicleIds(new Set());
          alert(`Successfully deleted ${selectedVehicleIds.size} vehicle(s).`);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'vehicles');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const processImportData = (data: string) => {
    return new Promise<any[]>((resolve, reject) => {
      Papa.parse(data, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error)
      });
    });
  };

  const handleSheetsImport = async () => {
    if (!sheetsUrl) return;
    const spreadsheetId = extractIdFromUrl(sheetsUrl);
    if (!spreadsheetId) {
      alert('Invalid Google Sheets URL. Please copy-paste the full browser URL.');
      return;
    }
    
    setIsSyncingSheets(true);
    setImportStatus('Connecting to Google Sheets...');
    try {
      const data = await fetchSheetData(spreadsheetId, 'A1:Z500');
      if (!data.values || data.values.length === 0) {
        throw new Error('The spreadsheet appears to be empty.');
      }
      
      if (data.values.length < 2) {
        throw new Error('Only headers found. Please add at least one data row.');
      }
      
      const filteredValues = data.values.filter(row => row.some(cell => cell.toString().trim() !== ''));
      
      if (filteredValues.length < 2) {
        throw new Error('No valid data rows found in the spreadsheet.');
      }

      const csvString = Papa.unparse(filteredValues);
      setImportText(csvString);
      setImportStatus('Data fetched! ' + (filteredValues.length - 1) + ' rows ready for AI mapping.');
    } catch (error: any) {
      alert('Sheets sync failed: ' + error.message);
      setImportStatus('');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleBulkImport = async () => {
    if (!importFile && !importText.trim()) return;
    setIsImporting(true);
    setImportStatus('Parsing data...');

    try {
      let rows: any[] = [];
      
      if (importFile) {
        rows = await new Promise<any[]>((resolve, reject) => {
          Papa.parse(importFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (error) => reject(error)
          });
        });
      } else {
        rows = await processImportData(importText);
      }

      if (rows.length === 0) {
        throw new Error("No data rows found. Ensure your source has a header row and at least one row of data.");
      }

      if (shouldClearBeforeImport) {
        setImportStatus('Clearing existing fleet...');
        try {
          const snapshot = await getDocs(collection(db, 'vehicles'));
          const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'vehicles', d.id)));
          await Promise.all(deletePromises);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'vehicles');
        }
      }

      setImportStatus(`Mapping ${rows.length} rows with AI...`);

      const mapping = await mapImportColumns(Object.keys(rows[0]), 'vehicles');

      setImportStatus('Importing to Operations Fleet...');

      const fleetRef = collection(db, 'vehicles');
      
      try {
        for (const row of rows) {
          const rawStatus = (row[mapping.status] || 'available').toString().trim().toLowerCase();
          
          // Heuristic to handle "VEHICLE" as Make/Model
          let make = 'Ford';
          let model = 'Utility';
          const vehicleRaw = (row[mapping.make] || row[mapping.model] || row['VEHICLE'] || row['Vehicle'] || row['vehicle'] || '').toString().trim();
          if (vehicleRaw) {
            const parts = vehicleRaw.split(/\s+/);
            if (parts.length > 0) {
              make = parts[0];
            }
            if (parts.length > 1) {
              model = parts.slice(1).join(' ');
            }
          } else {
            make = (row[mapping.make] || 'Ford').toString().trim();
            model = (row[mapping.model] || 'Utility').toString().trim();
          }

          const vehicleData: any = {
            make,
            model,
            year: Number(row[mapping.year]) || 2022,
            plateNumber: (row[mapping.plateNumber] || row['Plate #'] || row['Plate'] || row['plateNumber'] || 'TBD-0000').toString().trim(),
            color: (row[mapping.color] || row['Colors'] || row['Color'] || row['color'] || 'White').toString().trim(),
            status: ['available', 'rented', 'maintenance'].includes(rawStatus) ? rawStatus : 'available',
            registrant: (row[mapping.registrant] || row['REGISTRANT'] || row['Registrant'] || row['registrant'] || '').toString().trim(),
            lienholder: (row[mapping.lienholder] || row['Lienholder'] || row['lienholder'] || '').toString().trim(),
            notes: (row[mapping.notes] || row['NOTES'] || row['Notes'] || row['notes'] || '').toString().trim(),
            createdAt: serverTimestamp()
          };

          await addDoc(fleetRef, vehicleData);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'vehicles');
      }

      setImportStatus('Import complete!');
      setImportText('');
      setImportFile(null);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportStatus('');
        fetchVehicles();
      }, 1500);

    } catch (error: any) {
      console.error("Import failed:", error);
      alert("Import failed: " + error.message);
      setImportStatus('');
    } finally {
      setIsImporting(false);
    }
  };

  const deleteVehicle = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Vehicle',
      message: 'Are you sure you want to delete this vehicle from the fleet? This action is permanent and cannot be undone.',
      confirmText: 'Delete Vehicle',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'vehicles', id));
          setVehicles(prev => prev.filter(v => v.id !== id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'vehicle');
        }
      }
    });
  };

  const openAddVehicleModal = () => {
    setEditingVehicleId(null);
    setVehicleForm({
      make: '',
      model: '',
      year: new Date().getFullYear(),
      plateNumber: '',
      color: '',
      status: 'available',
      registrant: '',
      lienholder: '',
      notes: ''
    });
    setIsVehicleModalOpen(true);
  };

  const openEditVehicleModal = (v: Vehicle) => {
    setEditingVehicleId(v.id);
    setVehicleForm({
      make: v.make || '',
      model: v.model || '',
      year: Number(v.year) || new Date().getFullYear(),
      plateNumber: v.plateNumber || '',
      color: v.color || '',
      status: v.status || 'available',
      registrant: v.registrant || '',
      lienholder: v.lienholder || '',
      notes: v.notes || ''
    });
    setIsVehicleModalOpen(true);
  };

  const handleVehicleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.make || !vehicleForm.model || !vehicleForm.plateNumber) {
      alert('Please fill out the Make, Model, and Plate Number.');
      return;
    }

    setLoading(true);
    try {
      if (editingVehicleId) {
        // Edit flow
        const ref = doc(db, 'vehicles', editingVehicleId);
        await updateDoc(ref, {
          ...vehicleForm,
          year: Number(vehicleForm.year) || 2022
        });
        
        setVehicles(prev => prev.map(v => v.id === editingVehicleId ? {
          ...v,
          ...vehicleForm,
          year: Number(vehicleForm.year) || 2022
        } : v));
        
        setIsVehicleModalOpen(false);
        alert('Vehicle updated successfully.');
      } else {
        // Create flow
        const fleetRef = collection(db, 'vehicles');
        const docRef = await addDoc(fleetRef, {
          ...vehicleForm,
          year: Number(vehicleForm.year) || 2022,
          createdAt: serverTimestamp()
        });
        
        const newlyAdded: Vehicle = {
          id: docRef.id,
          ...vehicleForm,
          year: Number(vehicleForm.year) || 2022,
          createdAt: new Date()
        };
        
        setVehicles(prev => [newlyAdded, ...prev]);
        setIsVehicleModalOpen(false);
        alert('Vehicle added successfully.');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vehicles');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'vehicles'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];
      setVehicles(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchVehicles();
  }, []);

  const filteredVehicles = vehicles.filter(v => 
    v.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between px-4 sm:px-0">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search fleet by model, plate..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {filteredVehicles.length > 0 && (
            <button 
              onClick={toggleSelectAllVehicles}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <input 
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer pointer-events-none"
                checked={filteredVehicles.length > 0 && selectedVehicleIds.size === filteredVehicles.length}
                readOnly
              />
              <span>Select All</span>
            </button>
          )}

          {selectedVehicleIds.size > 0 && (
            <button 
              onClick={handleBulkDeleteVehicles}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-rose-700 transition-colors"
            >
              <Trash2 size={16} />
              <span>Delete Selected ({selectedVehicleIds.size})</span>
            </button>
          )}

          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            title="Import Fleet CSV/Sheets"
          >
            <UploadCloud size={16} />
            <span>Import</span>
          </button>

          <button 
            onClick={openAddVehicleModal}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Add Vehicle
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 px-4 sm:px-0">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-400">Loading fleet...</div>
        ) : filteredVehicles.length > 0 ? (
          filteredVehicles.map((vehicle) => (
            <div key={vehicle.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md relative">
              <div className="relative h-44 bg-slate-50 border-b border-slate-100">
                  {/* Selection Checkbox */}
                  <div className="absolute top-4 left-4 z-10" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedVehicleIds.has(vehicle.id)}
                      onChange={() => toggleSelectVehicle(vehicle.id)}
                    />
                  </div>
                  {/* Placeholder for vehicle image */}
                  <div className="flex h-full w-full items-center justify-center text-slate-200">
                     <Car size={64} className="transition-transform group-hover:scale-105" />
                  </div>
                  <div className={cn(
                    "absolute top-4 right-4 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                    vehicle.status === 'available' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    vehicle.status === 'rented' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-amber-50 text-amber-600 border-amber-100"
                  )}>
                    {vehicle.status}
                  </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-bold text-slate-800">{vehicle.year} {vehicle.make} {vehicle.model}</h4>
                    <span className="mt-1 inline-block font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 uppercase">
                      {vehicle.plateNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => deleteVehicle(vehicle.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Delete Vehicle"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button 
                      onClick={() => openEditVehicleModal(vehicle)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                      title="Edit Vehicle"
                    >
                      <Settings size={18} />
                    </button>
                  </div>
                </div>

                {(vehicle.registrant || vehicle.lienholder) && (
                  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
                    {vehicle.registrant && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-medium text-slate-400">Registrant:</span>
                        <span className="text-slate-700 font-bold max-w-[150px] truncate">{vehicle.registrant}</span>
                      </div>
                    )}
                    {vehicle.lienholder && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-medium text-slate-400">Lienholder:</span>
                        <span className="text-slate-700 font-bold max-w-[150px] truncate">{vehicle.lienholder}</span>
                      </div>
                    )}
                  </div>
                )}

                {vehicle.notes && (
                  <div className="mt-2.5 p-2 bg-slate-50/80 rounded-lg border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Notes</span>
                    <p className="text-[11px] text-slate-600 italic line-clamp-2 leading-relaxed">{vehicle.notes}</p>
                  </div>
                )}
                
                <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {vehicle.color || 'No Color Specified'}
                  </div>
                  <button className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline">
                    Manage <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <p className="text-slate-400">No vehicles matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Bulk Operations Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80]"
              onClick={() => !isImporting && setIsImportModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-2xl shadow-2xl z-[90] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Fleet Bulk Operations Import</h3>
                  <p className="text-xs text-slate-500">Paste Google Sheets link or upload CSV file below</p>
                </div>
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3">
                  <AlertCircle className="text-amber-600 shrink-0" size={20} />
                  <div className="text-[11px] text-amber-800 leading-relaxed">
                    <p className="font-bold mb-1 uppercase tracking-wider">Instructions for Fleet Mapping:</p>
                    <p>Provide headers like <b>make, model, year, plateNumber, color, status</b> in your CSV or sheet. Our mapping algorithm will match your columns automatically.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Upload CSV File</label>
                  <label className={cn(
                    "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-indigo-400 transition-all cursor-pointer group",
                    importFile && "bg-indigo-50 border-indigo-200"
                  )}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {importFile ? (
                        <>
                          <FileCheck className="w-8 h-8 text-indigo-500 mb-2" />
                          <p className="text-xs font-bold text-indigo-900">{importFile.name}</p>
                          <p className="text-[10px] text-indigo-500 mt-1">{(importFile.size / 1024).toFixed(1)} KB • Ready to import</p>
                        </>
                      ) : (
                        <>
                          <Download className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 transition-colors mb-2" />
                          <p className="text-xs text-slate-500 font-bold group-hover:text-slate-700 transition-colors">Drop CSV file here or click</p>
                          <p className="text-[10px] text-slate-400 mt-1">UTF-8 Comma-separated values only</p>
                        </>
                      )}
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".csv" 
                      onChange={(e) => {
                        setImportFile(e.target.files?.[0] || null);
                        if (e.target.files?.[0]) setImportText('');
                      }}
                    />
                  </label>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-100"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                    <span className="bg-white px-2 text-slate-300">Or Connect Google Sheet</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Paste Google Sheets URL here..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={sheetsUrl}
                      onChange={(e) => setSheetsUrl(e.target.value)}
                    />
                    <button 
                      onClick={handleSheetsImport}
                      disabled={!sheetsUrl || isSyncingSheets}
                      className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 disabled:opacity-50 transition-all"
                    >
                      {isSyncingSheets ? 'Fetching...' : 'Fetch'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Make sure the spreadsheet is shared publicly or with reader access.</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-100"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                    <span className="bg-white px-2 text-slate-300">Or Paste Raw CSV Text</span>
                  </div>
                </div>

                <textarea
                  className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  placeholder="Paste CSV raw text here..."
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    if (e.target.value.trim()) setImportFile(null);
                  }}
                  disabled={isImporting}
                />

                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={shouldClearBeforeImport} 
                    onChange={(e) => setShouldClearBeforeImport(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-700">Clear existing fleet first</p>
                    <p className="text-[10px] text-slate-400">Empty the vehicles catalog before starting import</p>
                  </div>
                </label>

                {importStatus && (
                  <div className="flex items-center gap-3 text-xs font-bold text-indigo-600 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <Clock className="animate-spin" size={14} />
                    {importStatus}
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button 
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportFile(null);
                    setImportText('');
                    setImportStatus('');
                  }}
                  className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                  disabled={isImporting}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkImport}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
                  disabled={isImporting || (!importText.trim() && !importFile)}
                >
                  Confirm Import
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add / Edit Vehicle Modal */}
      <AnimatePresence>
        {isVehicleModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80]"
              onClick={() => setIsVehicleModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl z-[90] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingVehicleId ? 'Edit Vehicle Information' : 'Add New Vehicle to Fleet'}
                  </h3>
                  <p className="text-xs text-slate-500">Provide registration details, colors, and notes below</p>
                </div>
                <button 
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleVehicleFormSubmit}>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Make *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Ford, Toyota"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={vehicleForm.make}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Model *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Explorer, Camry"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={vehicleForm.model}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Year</label>
                      <input 
                        type="number" 
                        min="1900"
                        max={new Date().getFullYear() + 2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={vehicleForm.year}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, year: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Plate Number *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. ABC-1234"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                        value={vehicleForm.plateNumber}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Colors</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Metallic Black"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={vehicleForm.color}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Registrant</label>
                      <input 
                        type="text" 
                        placeholder="Registrant Name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={vehicleForm.registrant}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, registrant: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Lienholder</label>
                      <input 
                        type="text" 
                        placeholder="Lienholder name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={vehicleForm.lienholder}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, lienholder: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={vehicleForm.status}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value as any })}
                    >
                      <option value="available">Available</option>
                      <option value="rented">Rented</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Notes</label>
                    <textarea
                      placeholder="Enter optional notes..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={vehicleForm.notes}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsVehicleModalOpen(false)}
                    className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2"
                  >
                    {editingVehicleId ? 'Save Changes' : 'Add Vehicle'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
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
                  onClick={confirmModal.onConfirm}
                  className={cn(
                    "px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all hover:opacity-90 active:scale-[0.98]",
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
