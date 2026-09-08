import { ComponentType } from 'react';
import dynamic from 'next/dynamic';

/** Fix 7 — recharts is a heavy dependency; loading it only on the client,
 * only for pages that actually render a chart, keeps it out of the initial
 * bundle everywhere else. Cast to ComponentType<any> because recharts' own
 * defaultProps typing doesn't satisfy next/dynamic's stricter
 * LoaderComponent inference. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dynamicChart(loader: () => Promise<any>): ComponentType<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dynamic(loader, { ssr: false }) as ComponentType<any>;
}
