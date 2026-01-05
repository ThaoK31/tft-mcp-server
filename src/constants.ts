// Régions de routage pour l'API TFT (matchs, account)
export type Region = "americas" | "europe" | "asia" | "sea";

// Plateformes pour l'API TFT (summoner, ranked)
export type Platform = "euw1" | "eun1" | "na1" | "br1" | "la1" | "la2" | "oc1" | "kr" | "jp1" | "tr1" | "ru" | "ph2" | "sg2" | "th2" | "tw2" | "vn2";

export const VALID_REGIONS: Region[] = ["americas", "europe", "asia", "sea"];

// Mapping des taglines courants vers les régions (pour les matchs)
export const REGION_MAPPING: Record<string, Region> = {
  // Americas
  na: "americas",
  na1: "americas",
  br: "americas",
  br1: "americas",
  lan: "americas",
  las: "americas",
  oce: "americas",
  // Europe
  euw: "europe",
  euw1: "europe",
  eune: "europe",
  eun1: "europe",
  tr: "europe",
  tr1: "europe",
  ru: "europe",
  // Asia
  kr: "asia",
  jp: "asia",
  jp1: "asia",
  // SEA
  sea: "sea",
  sg: "sea",
  ph: "sea",
  tw: "sea",
  vn: "sea",
  th: "sea",
};

// Mapping des taglines vers les plateformes (pour ranked/summoner)
export const PLATFORM_MAPPING: Record<string, Platform> = {
  // Europe
  euw: "euw1",
  euw1: "euw1",
  eune: "eun1",
  eun1: "eun1",
  tr: "tr1",
  tr1: "tr1",
  ru: "ru",
  // Americas
  na: "na1",
  na1: "na1",
  br: "br1",
  br1: "br1",
  lan: "la1",
  la1: "la1",
  las: "la2",
  la2: "la2",
  oce: "oc1",
  oc1: "oc1",
  // Asia
  kr: "kr",
  jp: "jp1",
  jp1: "jp1",
  // SEA
  sg: "sg2",
  ph: "ph2",
  tw: "tw2",
  vn: "vn2",
  th: "th2",
};

export function getRiotAccountApi(region: Region): string {
  return `https://${region}.api.riotgames.com/riot/account/v1`;
}

export function getRiotApiBase(region: Region): string {
  return `https://${region}.api.riotgames.com`;
}

export function getPlatformApiBase(platform: Platform): string {
  return `https://${platform}.api.riotgames.com`;
}
