import type { WidgetSnapshot } from '@/core/widget';

export { widgetAvailable } from './available';

/**
 * Le pasa al widget los números del día (o los borra si `snapshot` es null).
 * Esta versión no hace nada: es la que se usa donde no hay widget (web).
 * Las reales están en index.ios.tsx e index.android.tsx.
 */
export async function syncWidget(_snapshot: WidgetSnapshot | null): Promise<void> {}
