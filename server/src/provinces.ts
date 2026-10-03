import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './paths.js';

/**
 * Province ids (e.g. "CA-ON") and the country each belongs to, read from the same generated file the
 * site uses (client/src/data/provinces.json, from scripts/build-provinces.mjs).
 */
const list = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'client/src/data/provinces.json'), 'utf8')) as {
  id: string;
  iso: string;
}[];

const PROVINCE_COUNTRY = new Map(list.map((p) => [p.id, p.iso]));

/** Countries whose photos live in provinces (USA, CAN, CHN). */
export const PROVINCE_COUNTRIES = new Set(list.map((p) => p.iso));

export const provinceBelongsTo = (province: string, iso: string) => PROVINCE_COUNTRY.get(province) === iso;
