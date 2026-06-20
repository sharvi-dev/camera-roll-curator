import * as MediaLibrary from 'expo-media-library';
import { DateRange, Photo } from '../types';

export async function requestPermissions(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted';
}

export async function fetchPhotosInRange(range: DateRange): Promise<Photo[]> {
  const photos: Photo[] = [];
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  let after: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      first: 200,
      after,
    });

    for (const asset of page.assets) {
      if (asset.creationTime < startMs) {
        hasMore = false;
        break;
      }
      if (asset.creationTime <= endMs) {
        photos.push({
          id: asset.id,
          uri: asset.uri,
          filename: asset.filename,
          creationTime: asset.creationTime,
          width: asset.width,
          height: asset.height,
        });
      }
    }

    if (!page.hasNextPage) hasMore = false;
    after = page.endCursor;
  }

  return photos;
}
