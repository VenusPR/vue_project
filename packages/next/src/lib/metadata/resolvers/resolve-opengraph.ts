import type { Metadata, ResolvedMetadata } from '../types/metadata-interface'
import type {
  OpenGraphType,
  OpenGraph,
  ResolvedOpenGraph,
} from '../types/opengraph-types'
import type { FieldResolverWithMetadataBase } from '../types/resolvers'
import type { ResolvedTwitterMetadata } from '../types/twitter-types'
import { resolveAsArrayOrUndefined } from '../generate/utils'
import { isStringOrURL, resolveUrl } from './resolve-url'

const OgTypFields = {
  article: ['authors', 'tags'],
  song: ['albums', 'musicians'],
  playlist: ['albums', 'musicians'],
  radio: ['creators'],
  video: ['actors', 'directors', 'writers', 'tags'],
  basic: [
    'emails',
    'phoneNumbers',
    'faxNumbers',
    'alternateLocale',
    'images',
    'audio',
    'videos',
  ],
} as const

function getFieldsByOgType(ogType: OpenGraphType | undefined) {
  switch (ogType) {
    case 'article':
    case 'book':
      return OgTypFields.article
    case 'music.song':
    case 'music.album':
      return OgTypFields.song
    case 'music.playlist':
      return OgTypFields.playlist
    case 'music.radio_station':
      return OgTypFields.radio
    case 'video.movie':
    case 'video.episode':
      return OgTypFields.video
    default:
      return OgTypFields.basic
  }
}

export function resolveOpenGraph(
  openGraph: Metadata['openGraph'],
  metadataBase: ResolvedMetadata['metadataBase']
): ResolvedMetadata['openGraph'] {
  if (!openGraph) return null

  const url = resolveUrl(openGraph.url, metadataBase)
  const resolved = { ...openGraph } as ResolvedOpenGraph

  function assignProps(og: OpenGraph) {
    const ogType = og && 'type' in og ? og.type : undefined
    const keys = getFieldsByOgType(ogType)
    for (const k of keys) {
      const key = k as keyof ResolvedOpenGraph
      if (key in og && key !== 'url') {
        const value = og[key]
        if (value) {
          const arrayValue = resolveAsArrayOrUndefined(value)
          /// TODO: improve typing inferring
          ;(resolved as any)[key] = arrayValue
        }
      }
    }
  }

  assignProps(openGraph)

  resolved.url = url

  return resolved
}

const TwitterBasicInfoKeys = [
  'site',
  'siteId',
  'creator',
  'creatorId',
  'description',
] as const

export const resolveTwitter: FieldResolverWithMetadataBase<'twitter'> = (
  twitter,
  metadataBase
) => {
  if (!twitter) return null
  const resolved = {
    title: twitter.title,
  } as ResolvedTwitterMetadata
  for (const infoKey of TwitterBasicInfoKeys) {
    resolved[infoKey] = twitter[infoKey] || null
  }
  resolved.images = resolveAsArrayOrUndefined(twitter.images)?.map((item) => {
    if (isStringOrURL(item))
      return {
        url: metadataBase ? resolveUrl(item, metadataBase) : item,
      }
    else {
      return {
        url: metadataBase ? resolveUrl(item.url, metadataBase) : item.url,
        alt: item.alt,
      }
    }
  })
  if ('card' in twitter) {
    resolved.card = twitter.card
    switch (twitter.card) {
      case 'player': {
        // @ts-ignore
        resolved.players = resolveAsArrayOrUndefined(twitter.players) || []
        break
      }
      case 'app': {
        // @ts-ignore
        resolved.app = twitter.app || {}
        break
      }
      default:
        break
    }
  } else {
    resolved.card = 'summary'
  }

  return resolved
}
