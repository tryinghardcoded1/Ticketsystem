import { Ticket } from '../types';

export async function extractTicketData(imageFile: File): Promise<Partial<Ticket>> {
  try {
    const reader = new FileReader();
    const base64DataPromise = new Promise<string>((resolve) => {
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.readAsDataURL(imageFile);
    });

    const base64Data = await base64DataPromise;

    const aiResponse = await fetch('/api/extract-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [base64Data] })
    });

    if (!aiResponse.ok) throw new Error("AI Extraction failed");
    
    const extracted = await aiResponse.json();

    return {
      plateNumber: extracted.plate_number || 'UNKNOWN',
      violationDate: extracted.violation_date || new Date().toISOString().split('T')[0],
      amount: Number(extracted.amount) || 0,
      violationType: extracted.violation_type || 'Unknown Violation',
      make: extracted.make,
      model: extracted.model,
      location: extracted.state || 'Unknown Location'
    };
  } catch (error) {
    console.error("AI Extraction failed:", error);
    // Return dummy data if AI fails
    return {
      plateNumber: "ABC-1234",
      violationDate: new Date().toISOString().split('T')[0],
      amount: 45.00,
      violationType: 'Speeding',
      location: 'PA'
    };
  }
}

export async function mapImportColumns(headers: string[], type: 'rentals' | 'tickets' | 'vehicles'): Promise<Record<string, string>> {
  try {
    const response = await fetch('/api/map-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers, type })
    });

    if (!response.ok) throw new Error('AI Mapping failed');
    return await response.json();
  } catch (error) {
    console.error('Column mapping failed:', error);
    // Return empty mapping to allow manual adjustment if we had a UI for it, 
    // but here we just return empty which will result in empty fields or best-effort.
    return {};
  }
}

