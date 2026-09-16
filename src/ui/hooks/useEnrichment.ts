import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EnrichmentLoaders, Theme } from '@core/enrich';
import type { Sanitizer } from '@core/sanitize';
import { resolveTheme, type Settings } from '@core/settings';
import { enrichmentLoaders } from '../../platform/enrichment-loaders';
import { t } from '../i18n';

/**
 * Builds the phase-two configuration, and re-runs it when the theme changes.
 *
 * Shiki and Mermaid both bake the theme into their output, so a theme switch
 * has to re-render them. Watching the media query matters for the 'system'
 * setting, where the OS can change underneath a page that is already open.
 */
export function useEnrichment(sanitizer: Sanitizer, settings: Settings, doc: Document) {
  const [prefersDark, setPrefersDark] = useState(() => matchesDark(doc));

  useEffect(() => {
    const view = doc.defaultView;
    if (!view?.matchMedia) return;
    const query = view.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setPrefersDark(query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [doc]);

  const theme: Theme = resolveTheme(settings.theme, prefersDark);

  return useMemo(
    () => ({
      loaders: enrichmentLoaders satisfies EnrichmentLoaders,
      sanitizer,
      theme,
      features: {
        highlight: settings.features.highlight,
        math: settings.features.math,
        diagrams: settings.features.diagrams,
      },
      // Core has no translator; the strings it shows arrive with the rest of
      // its inputs.
      messages: {
        diagramFailed: t('diagramFailed'),
        expressionFailed: t('expressionFailed'),
        diagramLabel: t('diagramLabel'),
        diagramFallbackLabel: t('diagramFallbackLabel'),
        diagramSourceIntro: t('diagramSourceIntro'),
      },
    }),
    [
      sanitizer,
      theme,
      settings.features.highlight,
      settings.features.math,
      settings.features.diagrams,
    ],
  );
}

function matchesDark(doc: Document): boolean {
  return doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
