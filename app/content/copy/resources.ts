// [FR5] User-facing copy for the resource listing and detail pages. Kept in one file, same
// convention as app/content/copy/postScreening.ts and app/content/copy/conversation.ts.

export const RESOURCES_LIST_TITLE = 'Resources'
export const RESOURCES_LIST_INTRO =
  'Plain-language information about depression, anxiety, and coping — available any time, ' +
  'whether or not you have completed a screening.'
export const RESOURCES_LIST_LOADING = 'Loading resources…'
export const RESOURCES_LIST_ERROR =
  "We couldn't load the resource library. Check your connection and try again."
export const RESOURCES_LIST_EMPTY = 'No resources are available right now.'

export function readingTimeLabel(minutes: number): string {
  return `${minutes} min read`
}

export const RESOURCES_DETAIL_LOADING = 'Loading…'
export const RESOURCES_DETAIL_NOT_FOUND = "We couldn't find that resource."
// [NFR2] Shown when a live fetch fails but a previously-visited copy was found in this device's
// own storage — see app/pages/resources/[slug].vue's offline-cache-on-visit behaviour.
export const RESOURCES_DETAIL_OFFLINE_NOTICE =
  "You're viewing a saved copy of this page from your last visit — it may be out of date, and " +
  "won't update again until you're back online."
export const RESOURCES_BACK_TO_LIST_LABEL = 'All resources'
export const RESOURCES_SOURCE_LABEL = 'Source'

export const TEXT_SIZE_CONTROL_LABEL = 'Text size'
export const TEXT_SIZE_OPTIONS = [
  { value: 'sm', label: 'Small text', display: 'A' },
  { value: 'md', label: 'Medium text', display: 'A' },
  { value: 'lg', label: 'Large text', display: 'A' }
] as const
