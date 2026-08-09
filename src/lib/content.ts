import booksOfTheBiblePlace from '@/content/places/books-of-the-bible.json';
import covenantsPlace from '@/content/places/covenants.json';
import creedsPlace from '@/content/places/creeds.json';
import discipleshipPlace from '@/content/places/discipleship.json';
import edenPlace from '@/content/places/eden.json';
import endurancePlace from '@/content/places/endurance.json';
import exodusJourneyPlace from '@/content/places/exodus-journey.json';
import faithfulnessPlace from '@/content/places/faithfulness.json';
import fallPlace from '@/content/places/fall.json';
import godsWordPlace from '@/content/places/gods-word.json';
import gracePlace from '@/content/places/grace.json';
import heavenPlace from '@/content/places/heaven.json';
import holySpiritPlace from '@/content/places/holy-spirit.json';
import loveOneAnotherPlace from '@/content/places/love-one-another.json';
import mercyPlace from '@/content/places/mercy.json';
import messianicProphecyPlace from '@/content/places/messianic-prophecy.json';
import obediencePlace from '@/content/places/obedience.json';
import patiencePlace from '@/content/places/patience.json';
import patriarchsPlace from '@/content/places/patriarchs.json';
import peacePlace from '@/content/places/peace.json';
import prayerPlace from '@/content/places/prayer.json';
import psalmsHighlightsPlace from '@/content/places/psalms-highlights.json';
import romansRoadPlace from '@/content/places/romans-road.json';
import sinPlace from '@/content/places/sin.json';
import spiritAndFleshPlace from '@/content/places/spirit-and-flesh.json';
import theChurchPlace from '@/content/places/the-church.json';
import theTrinityPlace from '@/content/places/the-trinity.json';

import booksOfTheBible from '@/content/trails/books-of-the-bible.json';
import covenants from '@/content/trails/covenants.json';
import creationAndCovenant from '@/content/trails/creation-and-covenant.json';
import creeds from '@/content/trails/creeds.json';
import discipleship from '@/content/trails/discipleship.json';
import endurance from '@/content/trails/endurance.json';
import exodusJourney from '@/content/trails/exodus-journey.json';
import faithfulness from '@/content/trails/faithfulness.json';
import fall from '@/content/trails/fall.json';
import godsWord from '@/content/trails/gods-word.json';
import grace from '@/content/trails/grace.json';
import heaven from '@/content/trails/heaven.json';
import holySpirit from '@/content/trails/holy-spirit.json';
import loveOneAnother from '@/content/trails/love-one-another.json';
import mercy from '@/content/trails/mercy.json';
import messianicProphecy from '@/content/trails/messianic-prophecy.json';
import obedience from '@/content/trails/obedience.json';
import patience from '@/content/trails/patience.json';
import patriarchs from '@/content/trails/patriarchs.json';
import peace from '@/content/trails/peace.json';
import prayer from '@/content/trails/prayer.json';
import psalmsHighlights from '@/content/trails/psalms-highlights.json';
import romansRoad from '@/content/trails/romans-road.json';
import sin from '@/content/trails/sin.json';
import spiritAndFlesh from '@/content/trails/spirit-and-flesh.json';
import theChurch from '@/content/trails/the-church.json';
import theTrinity from '@/content/trails/the-trinity.json';
import webVerses from '@/content/verses/web.json';

import { Place, Trail } from './types';

// Every trail JSON file under /content/trails goes here as the family's curriculum grows.
const trailFiles = [
  creationAndCovenant,
  fall,
  patriarchs,
  exodusJourney,
  sin,
  messianicProphecy,
  covenants,
  theTrinity,
  romansRoad,
  theChurch,
  holySpirit,
  heaven,
  spiritAndFlesh,
  obedience,
  discipleship,
  faithfulness,
  endurance,
  patience,
  peace,
  loveOneAnother,
  grace,
  mercy,
  godsWord,
  psalmsHighlights,
  booksOfTheBible,
  prayer,
  creeds,
];

// Every place JSON file under /content/places goes here as the map grows.
const placeFiles: Place[] = [
  edenPlace,
  fallPlace,
  patriarchsPlace,
  exodusJourneyPlace,
  sinPlace,
  messianicProphecyPlace,
  covenantsPlace,
  theTrinityPlace,
  romansRoadPlace,
  theChurchPlace,
  holySpiritPlace,
  heavenPlace,
  spiritAndFleshPlace,
  obediencePlace,
  discipleshipPlace,
  faithfulnessPlace,
  endurancePlace,
  patiencePlace,
  peacePlace,
  loveOneAnotherPlace,
  gracePlace,
  mercyPlace,
  godsWordPlace,
  psalmsHighlightsPlace,
  booksOfTheBiblePlace,
  prayerPlace,
  creedsPlace,
];

const verseTextByReferenceAndTranslation: Record<string, Record<string, string>> = {
  WEB: webVerses as Record<string, string>,
};

export function getVerseText(reference: string, translation: string): string | null {
  return verseTextByReferenceAndTranslation[translation]?.[reference] ?? null;
}

export function getAllTrails(): Trail[] {
  return trailFiles
    .map((file) => ({
      id: file.slug,
      slug: file.slug,
      title: file.title,
      description: file.description,
      coverImage: file.coverImage ?? undefined,
      sortOrder: file.sortOrder,
      waypoints: file.waypoints
        .map((wp) => ({
          id: wp.id,
          trailId: file.slug,
          type: wp.type as Trail['waypoints'][number]['type'],
          sortOrder: wp.sortOrder,
          title: wp.title,
          verse: 'verse' in wp ? wp.verse : undefined,
          body: 'body' in wp ? wp.body : undefined,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getTrailBySlug(slug: string): Trail | undefined {
  return getAllTrails().find((trail) => trail.slug === slug);
}

export function getWaypointById(id: string): Trail['waypoints'][number] | undefined {
  for (const trail of getAllTrails()) {
    const match = trail.waypoints.find((wp) => wp.id === id);
    if (match) return match;
  }
  return undefined;
}

export function getAllPlaces(): Place[] {
  return placeFiles;
}

export function getPlaceBySlug(slug: string): Place | undefined {
  return placeFiles.find((place) => place.slug === slug);
}

export function getPlacesUnlockedByWaypoint(waypointId: string): Place[] {
  return placeFiles.filter((place) => place.unlockedByWaypointIds.includes(waypointId));
}
