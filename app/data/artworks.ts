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
    articleTitle: "Mona Lisa",
    title: "Mona Lisa",
    artist: "Leonardo da Vinci",
    year: "c. 1503–1505",
    fallbackFile:
      "Mona Lisa, by Leonardo da Vinci, from C2RMF natural color.jpg",
    accent: "#6c6550",
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
    fallbackFile: '"The School of Athens" by Raffaello Sanzio da Urbino.jpg',
    accent: "#896349",
  },
  {
    articleTitle: "The Creation of Adam",
    title: "The Creation of Adam",
    artist: "Michelangelo",
    year: "c. 1511",
    fallbackFile: "Michelangelo - Creation of Adam (cropped).jpg",
    accent: "#9b7863",
  },
  {
    articleTitle: "Arnolfini Portrait",
    title: "The Arnolfini Portrait",
    artist: "Jan van Eyck",
    year: "1434",
    fallbackFile: "The Arnolfini portrait (1434).jpg",
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
    fallbackFile: "The Garden of earthly delights.jpg",
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
    articleTitle: "The Night Watch",
    title: "The Night Watch",
    artist: "Rembrandt",
    year: "1642",
    fallbackFile: "La ronda de noche, por Rembrandt van Rijn.jpg",
    accent: "#514538",
  },
  {
    articleTitle: "Girl with a Pearl Earring",
    title: "Girl with a Pearl Earring",
    artist: "Johannes Vermeer",
    year: "c. 1665",
    fallbackFile: "1665 Girl with a Pearl Earring.jpg",
    accent: "#4d625e",
  },
  {
    articleTitle: "Las Meninas",
    title: "Las Meninas",
    artist: "Diego Velázquez",
    year: "1656",
    fallbackFile:
      "Las Meninas, by Diego Velázquez, from Prado in Google Earth.jpg",
    accent: "#635847",
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
