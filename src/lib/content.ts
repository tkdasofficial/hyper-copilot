/**
 * Data layer placeholders.
 *
 * Every list in the app reads from here. All of them intentionally return
 * empty data — wire these to the backend (database queries / server
 * functions) and the UI will populate automatically.
 */

export type AssetKind = "Image" | "Video" | "Audio" | "Vector";

export type LibraryAsset = {
  id: string;
  kind: AssetKind;
  src?: string;
  alt?: string;
  prompt: string;
  meta: string;
  date: string;
};

export type GalleryItem = {
  id: string;
  src: string;
  width: number;
  height: number;
  prompt: string;
  model: string;
  alt: string;
};

export type RecentCreation = {
  id: string;
  src: string;
  prompt: string;
  meta: string;
  alt: string;
};

export type Account = {
  name: string;
  initials: string;
  plan: string;
  credits: number;
} | null;

/** TODO: replace with a backend query for the signed-in user's assets. */
export const libraryAssets: LibraryAsset[] = [];

/** TODO: replace with a backend query for public community generations. */
export const galleryItems: GalleryItem[] = [];

/** TODO: replace with a backend query for the user's latest generations. */
export const recentCreations: RecentCreation[] = [];

/** TODO: replace with the authenticated user's profile. */
export const account: Account = null;
