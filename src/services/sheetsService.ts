import { getAccessToken } from '../lib/firebase';

export interface SheetData {
  range: string;
  majorDimension: string;
  values: string[][];
}

export async function fetchSheetData(spreadsheetId: string, range: string): Promise<SheetData> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated with Google. Please log in again.');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch sheet data');
  }

  return response.json();
}

export async function createSpreadsheet(title: string): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated with Google. Please log in again.');

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create spreadsheet');
  }

  const data = await response.json();
  return data.spreadsheetId;
}

export async function updateSheetValues(spreadsheetId: string, range: string, values: any[][]) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated with Google. Please log in again.');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update sheet');
  }

  return response.json();
}

export function extractIdFromUrl(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}
