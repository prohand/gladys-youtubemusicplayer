import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  artworkUrl,
  isVideoId,
  parseDurationText,
  parseQueue,
  parseSearch,
  pickThumbnail,
  songToNowPlaying,
  textOf,
} from '../src/ytmusic/parse.js';
import { SONG, queueItem, searchAnswer } from './helpers/fakeYtm.js';

test('durations are read from their text', () => {
  assert.equal(parseDurationText('3:45'), 225);
  assert.equal(parseDurationText('1:02:03'), 3723);
  assert.equal(parseDurationText('Song'), null);
  assert.equal(parseDurationText(undefined), null);
});

test('artwork URLs are resized for Gladys (≤ 300 KB)', () => {
  assert.equal(
    artworkUrl('https://lh3.googleusercontent.com/abc=w544-h544-l90-rj'),
    'https://lh3.googleusercontent.com/abc=w400-h400-l90-rj',
  );
  assert.equal(
    artworkUrl('https://i.ytimg.com/vi/x/maxresdefault.jpg'),
    'https://i.ytimg.com/vi/x/hqdefault.jpg',
  );
  assert.equal(artworkUrl('http://insecure/cover.jpg'), null);
  assert.equal(artworkUrl(null), null);
});

test('the thumbnail closest to a list size is picked', () => {
  assert.equal(
    pickThumbnail([
      { url: 'https://lh3.googleusercontent.com/a=w60-h60', width: 60 },
      { url: 'https://lh3.googleusercontent.com/a=w226-h226', width: 226 },
      { url: 'https://lh3.googleusercontent.com/a=w544-h544', width: 544 },
    ]),
    'https://lh3.googleusercontent.com/a=w400-h400-l90-rj',
  );
  assert.equal(pickThumbnail([]), null);
});

test('textOf reads runs and simpleText', () => {
  assert.equal(textOf({ runs: [{ text: 'a' }, { text: 'b' }] }), 'ab');
  assert.equal(textOf({ simpleText: 'c' }), 'c');
  assert.equal(textOf(null), '');
});

test('a song becomes the now playing values', () => {
  assert.deepEqual(songToNowPlaying(SONG), {
    title: 'Get Lucky',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    artwork_url: 'https://lh3.googleusercontent.com/abc=w400-h400-l90-rj',
    duration: 369,
    position: 12,
  });
  assert.deepEqual(songToNowPlaying(null), {
    title: '',
    artist: '',
    album: '',
    artwork_url: null,
    duration: 0,
    position: 0,
  });
});

test('the queue is read, wrapped items and current track included', () => {
  const { tracks, currentIndex } = parseQueue({
    items: [
      queueItem('aaaaaaaaaaa', 'One'),
      queueItem('bbbbbbbbbbb', 'Two', { selected: true, wrapped: true }),
      { somethingElse: {} },
    ],
  });
  assert.equal(tracks.length, 2);
  assert.equal(currentIndex, 1);
  assert.deepEqual(tracks[1], {
    videoId: 'bbbbbbbbbbb',
    title: 'Two',
    artist: 'Artist',
    duration: 185,
    artworkUrl: 'https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg',
  });
  assert.deepEqual(parseQueue(null), { tracks: [], currentIndex: null });
});

test('search keeps the playable tracks, top result first, without duplicates', () => {
  const tracks = parseSearch(searchAnswer());
  assert.deepEqual(
    tracks.map((track) => track.videoId),
    ['h5EofwRzit0', '5NV6Rdv1a3I'],
  );
  assert.equal(tracks[1].artist, 'Daft Punk, Pharrell Williams');
  assert.equal(tracks[1].album, 'Random Access Memories');
  assert.equal(tracks[1].duration, 369);
  assert.deepEqual(parseSearch({ unexpected: true }), []);
});

test('video ids are checked', () => {
  assert.equal(isVideoId('h5EofwRzit0'), true);
  assert.equal(isVideoId('MPREb_8QkDeEIawvX'), false);
  assert.equal(isVideoId(42), false);
});
