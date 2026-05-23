import React from 'react';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { Car, Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

export default function FormPage() {
  const [formData, setFormData] = React.useState({
    fullName: '',
    phone: '',
    email: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    address: '',
    vehicle: '',
    plateNumber: '',
    startDate: '',
    endDate: '',
  });

  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // File states
  const [driverLicense, setDriverLicense] = React.useState<File | null>(null);
  const [insurance, setInsurance] = React.useState<File | null>(null);
  const [signature, setSignature] = React.useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In a real app we'd upload files to Storage and get URLs.
      // Here we'll simulate it, or just not upload directly if Storage isn't set up.
      
      const payload = {
        firstName: formData.fullName.split(' ')[0] || '',
        lastName: formData.fullName.split(' ').slice(1).join(' ') || '',
        customerName: formData.fullName,
        phone: formData.phone,
        email: formData.email,
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhone: formData.emergencyContactPhone,
        streetAddress: formData.address,
        city: '', // derived from address in real app
        state: '',
        postalCode: '',
        vehicle: formData.vehicle,
        plateNumber: formData.plateNumber,
        startDate: formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : serverTimestamp(),
        endDate: formData.endDate ? Timestamp.fromDate(new Date(formData.endDate)) : serverTimestamp(),
        status: 'pending',
        agreements: {
          accidentNotification: true,
          killSwitch: true,
          underageFee: false,
          insuranceAck: true
        },
        licenseFile: driverLicense?.name || '',
        insuranceFile: insurance?.name || '',
        signatureFile: signature?.name || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'rentals'), payload);
      
      // Also copy to customers
      await addDoc(collection(db, 'customers'), {
        name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        createdAt: serverTimestamp()
      });

      setSuccess(true);
    } catch (err: any) {
      console.error("Submission error:", err);
      if (err.message?.includes('permission')) {
        setError("Missing permissions to submit form. If the problem persists, please contact support.");
      } else {
        setError("Failed to submit form: " + (err.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Submission Successful</h2>
          <p className="text-slate-500 font-medium">Your rental intake form has been submitted to the operations team.</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 text-sm font-bold text-indigo-600 hover:text-indigo-700"
          >
            Submit Another Form
          </button>
        </div>
      </div>
    );
  }

  const FileUploadField = ({ label, file, setFile }: { label: string, file: File | null, setFile: (f: File | null) => void }) => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      <label className="flex items-center justify-center w-full h-32 px-4 transition bg-slate-50 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer hover:bg-slate-100 hover:border-indigo-300">
        <div className="flex flex-col items-center space-y-2">
          {file ? (
            <>
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <span className="text-sm font-bold text-slate-700">{file.name}</span>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Click to upload</span>
            </>
          )}
        </div>
        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {error && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-rose-600 text-sm font-bold flex items-center gap-3">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
            <Car className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Rental Intake Form</h1>
          <p className="text-slate-500 font-medium">Please provide your details to process your rental.</p>
        </div>

        {/* Send to Customer Instruction Banner */}
        <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-800">Send to Customer</h4>
            <p className="text-xs text-indigo-950 font-medium">Open this link in new tab to send the form to customer:</p>
            <span className="text-xs font-mono text-indigo-600 truncate block max-w-full select-all font-semibold mt-1">
              {window.location.origin}/rental-form
            </span>
          </div>
          <button 
            onClick={() => window.open(window.location.origin + '/rental-form', '_blank')}
            className="shrink-0 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-all active:scale-[0.98]"
          >
            Open Link in New Tab
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white shadow-sm border border-slate-200 rounded-3xl p-6 sm:p-10 space-y-8">
          
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2">Customer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                <input required type="text" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Home Address</label>
                <input required type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="123 Main St, City, ST 12345" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Emergency Contact Name</label>
                <input required type="text" value={formData.emergencyContactName} onChange={e => setFormData({...formData, emergencyContactName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Emergency Contact Phone</label>
                <input required type="tel" value={formData.emergencyContactPhone} onChange={e => setFormData({...formData, emergencyContactPhone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2">Vehicle Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Vehicle Selected</label>
                <input required type="text" value={formData.vehicle} onChange={e => setFormData({...formData, vehicle: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Tesla Model 3" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Plate Number</label>
                <input required type="text" value={formData.plateNumber} onChange={e => setFormData({...formData, plateNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none uppercase" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Rental Start Date</label>
                <input required type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Rental End Date</label>
                <input required type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2">Required Documents</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <FileUploadField label="Driver License Upload" file={driverLicense} setFile={setDriverLicense} />
              <FileUploadField label="Insurance Upload" file={insurance} setFile={setInsurance} />
              <FileUploadField label="Signature Upload" file={signature} setFile={setSignature} />
            </div>
          </div>

          <div className="pt-6">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="animate-spin" /> Submitting...</> : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
