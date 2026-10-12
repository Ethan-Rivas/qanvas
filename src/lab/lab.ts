import { create } from 'zustand';

/** What quantum-lab's bridge offers, when Qanvas runs inside quantum-lab. */
export interface Lab {
  features: string[];
}

export const useLab = create<{ lab: Lab | null }>(() => ({ lab: null }));

/** Asks the bridge behind ./api/; on the website and in plain Docker there is none. */
export async function detectLab(): Promise<void> {
  try {
    const response = await fetch('./api/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!response.ok) return;
    const data = await response.json();
    if (data?.version === 1 && Array.isArray(data.features)) useLab.setState({ lab: { features: data.features } });
  } catch {
    // No lab: the lab-only buttons stay hidden.
  }
}

export async function saveNotebook(name: string, notebook: string): Promise<{ path: string; url: string }> {
  const response = await fetch('./api/notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, notebook: JSON.parse(notebook) }),
  });
  if (!response.ok) throw new Error(`The lab answered ${response.status}`);
  return response.json();
}
