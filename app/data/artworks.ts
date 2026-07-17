export type ArtworkSeed = {
  articleTitle: string;
  title: string;
  artist: string;
  year: string;
  fallbackFile: string;
  accent: string;
};

export type GalleryArtwork = ArtworkSeed & {
  imageUrl: string;
  articleUrl: string;
  description: string;
  license: string;
  licenseUrl?: string;
};

export const ARTWORK_SEEDS: ArtworkSeed[] = [
  {
    articleTitle: "The Birth of Venus",
    title: "The Birth of Venus",
    artist: "Sandro Botticelli",
    year: "c. 1485",
    fallbackFile:
      "Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg",
    accent: "#9f6a55",
  },
  {
    articleTitle: "The School of Athens",
    title: "The School of Athens",
    artist: "Raphael",
    year: "1509–1511",
    fallbackFile: "The School of Athens by Raffaello Sanzio da Urbino.jpg",
    accent: "#896349",
  },
  {
    articleTitle: "Lady with an Ermine",
    title: "Lady with an Ermine",
    artist: "Leonardo da Vinci",
    year: "c. 1489–1491",
    fallbackFile: "Leonardo da Vinci - Lady with an Ermine.jpg",
    accent: "#7b665a",
  },
  {
    articleTitle: "The Arnolfini Portrait",
    title: "The Arnolfini Portrait",
    artist: "Jan van Eyck",
    year: "1434",
    fallbackFile: "Van Eyck - Arnolfini Portrait.jpg",
    accent: "#516347",
  },
  {
    articleTitle: "The Ambassadors (Holbein)",
    title: "The Ambassadors",
    artist: "Hans Holbein the Younger",
    year: "1533",
    fallbackFile:
      "Hans Holbein the Younger - The Ambassadors - Google Art Project.jpg",
    accent: "#5d5742",
  },
  {
    articleTitle: "The Garden of Earthly Delights",
    title: "The Garden of Earthly Delights",
    artist: "Hieronymus Bosch",
    year: "c. 1490–1510",
    fallbackFile: "The Garden of Earthly Delights by Bosch High Resolution.jpg",
    accent: "#85775c",
  },
  {
    articleTitle: "Venus of Urbino",
    title: "Venus of Urbino",
    artist: "Titian",
    year: "1538",
    fallbackFile: "Tiziano - Venere di Urbino - Google Art Project.jpg",
    accent: "#9c705e",
  },
  {
    articleTitle: "The Last Supper (Leonardo)",
    title: "The Last Supper",
    artist: "Leonardo da Vinci",
    year: "c. 1495–1498",
    fallbackFile: "The Last Supper - Leonardo Da Vinci - High Resolution 32x16.jpg",
    accent: "#756654",
  },
  {
    articleTitle: "The Tempest (Giorgione)",
    title: "The Tempest",
    artist: "Giorgione",
    year: "c. 1506–1508",
    fallbackFile: "Giorgione, The tempest.jpg",
    accent: "#5c6b58",
  },
  {
    articleTitle: "Primavera (Botticelli)",
    title: "Primavera",
    artist: "Sandro Botticelli",
    year: "late 1470s–early 1480s",
    fallbackFile: "Botticelli-primavera.jpg",
    accent: "#6f664b",
  },
];

export function commonsRedirect(fileName: string) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

export function fallbackArtwork(seed: ArtworkSeed): GalleryArtwork {
  return {
    ...seed,
    imageUrl: commonsRedirect(seed.fallbackFile),
    articleUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(seed.articleTitle.replaceAll(" ", "_"))}`,
    description: `${seed.title} is a work by ${seed.artist}, presented from a curated public-domain collection of Renaissance painting.`,
    license: "Public domain",
  };
}
