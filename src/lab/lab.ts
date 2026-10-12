import { create } from 'zustand';

/** What quantum-lab's bridge offers, when Qanvas runs inside quantum-lab. */
export interface Lab {
  features: string[];
}

export const useLab = create<{ lab: Lab | null }>(() => ({ lab: null }));

async function askLab(): Promise<Lab | null> {
  try {
    const response = await fetch('./api/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.version === 1 && Array.isArray(data.features) ? { features: data.features } : null;
  } catch {
    return null;
  }
}

/** Asks the bridge behind ./api/; on the website and in plain Docker there is none, and the lab-only buttons stay hidden. */
export async function detectLab(): Promise<void> {
  let lab = await askLab();
  // The page can load before the bridge has started, so a lab that doesn't answer gets one more try.
  if (!lab && (await fetch('./api/health', { method: 'HEAD' }).then((r) => r.status === 502 || r.status === 504, () => false))) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    lab = await askLab();
  }
  if (lab) useLab.setState({ lab });
}

export async function saveNotebook(name: string, notebook: string): Promise<{ path: string; url: string }> {
  const response = await fetch('./api/notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, notebook: JSON.parse(notebook) }),
  });
  if (!response.ok) throw new Error(`The lab answered ${response.status}`);
  const answer = await response.json();
  // The link opens in a tab that starts out with Qanvas's own origin, so only web addresses are allowed.
  if (typeof answer?.path !== 'string' || !/^https?:$/.test(new URL(answer.url).protocol)) throw new Error('The lab sent an unexpected link');
  return answer;
}
