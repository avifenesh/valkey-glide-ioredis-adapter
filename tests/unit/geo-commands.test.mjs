/**
 * GEO Commands Tests
 * Tests for geographical data operations
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../../dist/index.js';
const { Redis } = pkg;

describe('GEO Commands', () => {
  let client;
  const testKey = 'test:geo:locations';

  beforeEach(async () => {
    client = new Redis({
      host: process.env.VALKEY_HOST || 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6383'),
    });
    await client.connect();
    
    // Clean slate: flush all data to prevent test pollution
    // GLIDE's flushall is multislot safe
    try {
      await client.flushall();
    } catch (error) {
      console.warn('Warning: Could not flush database:', error.message);
    }
    await client.flushdb();
  });

  afterEach(async () => {
    if (client) {
      await client.flushdb();
      await client.disconnect();
    }
  });

  describe('GEOADD', () => {
    it('should add single location', async () => {
      const result = await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo'
      );
      assert.strictEqual(result, 1);
    });

    it('should add multiple locations', async () => {
      const result = await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania'
      );
      assert.strictEqual(result, 2);
    });

    it('should add locations with array format', async () => {
      const locations = [
        [13.361389, 38.115556, 'Palermo'],
        [15.087269, 37.502669, 'Catania'],
      ];

      // Flatten array for geoadd
      const args = locations.flat();
      const result = await client.geoadd(testKey, ...args);
      assert.strictEqual(result, 2);
    });

    it('should update existing location', async () => {
      await client.geoadd(testKey, 13.361389, 38.115556, 'Palermo');
      const result = await client.geoadd(
        testKey,
        13.36139,
        38.115557,
        'Palermo'
      );
      assert.strictEqual(result, 0); // 0 because it's an update, not a new addition
    });

    it('should handle NX option (only add new elements)', async () => {
      await client.geoadd(testKey, 13.361389, 38.115556, 'Palermo');
      const result = await client.geoadd(
        testKey,
        'NX',
        13.36139,
        38.115557,
        'Palermo'
      );
      assert.strictEqual(result, 0); // Should not update existing
    });

    it('should handle XX option (only update existing)', async () => {
      const result = await client.geoadd(
        testKey,
        'XX',
        13.361389,
        38.115556,
        'Palermo'
      );
      assert.strictEqual(result, 0); // Should not add new
    });

    it('should handle CH option (return changed elements)', async () => {
      await client.geoadd(testKey, 13.361389, 38.115556, 'Palermo');
      // Use a larger coordinate change that will be detected by the 52-bit geohash
      // Minimum detectable change is about 0.00001 degrees
      const result = await client.geoadd(
        testKey,
        'CH',
        13.3614,
        38.11557,
        'Palermo'
      );
      assert.strictEqual(result, 1); // 1 element changed
    });
  });

  describe('GEOPOS', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania'
      );
    });

    it('should get position of single member', async () => {
      const positions = await client.geopos(testKey, 'Palermo');
      assert.ok(Array.isArray(positions));
      assert.strictEqual(positions.length, 1);
      assert.ok(Array.isArray(positions[0]));
      assert.strictEqual(positions[0].length, 2);
      assert.ok(Math.abs(parseFloat(positions[0][0]) - 13.361389) < 0.0001);
      assert.ok(Math.abs(parseFloat(positions[0][1]) - 38.115556) < 0.0001);
    });

    it('should get positions of multiple members', async () => {
      const positions = await client.geopos(testKey, 'Palermo', 'Catania');
      assert.strictEqual(positions.length, 2);
      assert.ok(Array.isArray(positions[0]));
      assert.ok(Array.isArray(positions[1]));
    });

    it('should return null for non-existent member', async () => {
      const positions = await client.geopos(testKey, 'NonExistent');
      assert.strictEqual(positions.length, 1);
      assert.strictEqual(positions[0], null);
    });

    it('should handle mixed existing and non-existing members', async () => {
      const positions = await client.geopos(
        testKey,
        'Palermo',
        'NonExistent',
        'Catania'
      );
      assert.strictEqual(positions.length, 3);
      assert.ok(Array.isArray(positions[0]));
      assert.strictEqual(positions[1], null);
      assert.ok(Array.isArray(positions[2]));
    });
  });

  describe('GEODIST', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania'
      );
    });

    it('should calculate distance in meters (default)', async () => {
      const distance = await client.geodist(testKey, 'Palermo', 'Catania');
      assert.ok(distance);
      const dist = parseFloat(distance);
      assert.ok(dist > 166000 && dist < 167000); // ~166.2km in meters
    });

    it('should calculate distance in kilometers', async () => {
      const distance = await client.geodist(
        testKey,
        'Palermo',
        'Catania',
        'km'
      );
      assert.ok(distance);
      const dist = parseFloat(distance);
      assert.ok(dist > 166 && dist < 167);
    });

    it('should calculate distance in miles', async () => {
      const distance = await client.geodist(
        testKey,
        'Palermo',
        'Catania',
        'mi'
      );
      assert.ok(distance);
      const dist = parseFloat(distance);
      assert.ok(dist > 103 && dist < 104); // ~103.3 miles
    });

    it('should calculate distance in feet', async () => {
      const distance = await client.geodist(
        testKey,
        'Palermo',
        'Catania',
        'ft'
      );
      assert.ok(distance);
      const dist = parseFloat(distance);
      assert.ok(dist > 545000 && dist < 546000); // ~545,500 feet
    });

    it('should return null for non-existent members', async () => {
      const distance = await client.geodist(testKey, 'Palermo', 'NonExistent');
      assert.strictEqual(distance, null);
    });
  });

  describe('GEORADIUS', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania',
        13.583333,
        37.316667,
        'Agrigento'
      );
    });

    it('should find members within radius', async () => {
      const members = await client.georadius(testKey, 15, 37, 200, 'km');
      assert.ok(Array.isArray(members));
      assert.ok(members.includes('Catania'));
      assert.ok(members.includes('Agrigento'));
    });

    it('should return with coordinates', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'WITHCOORD'
      );
      assert.ok(Array.isArray(members));

      const catania = members.find(m => Array.isArray(m) && m[0] === 'Catania');
      assert.ok(catania);
      assert.strictEqual(catania[0], 'Catania');
      assert.ok(Array.isArray(catania[1]));
      assert.strictEqual(catania[1].length, 2);
    });

    it('should return with distance', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'WITHDIST'
      );
      assert.ok(Array.isArray(members));

      const catania = members.find(m => Array.isArray(m) && m[0] === 'Catania');
      assert.ok(catania);
      assert.strictEqual(catania[0], 'Catania');
      assert.ok(typeof catania[1] === 'string');
    });

    it('should return with hash', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'WITHHASH'
      );
      assert.ok(Array.isArray(members));

      const catania = members.find(m => Array.isArray(m) && m[0] === 'Catania');
      assert.ok(catania);
      assert.strictEqual(catania[0], 'Catania');
      assert.ok(typeof catania[1] === 'string');
    });

    it('should return with distance and coordinates', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'WITHDIST',
        'WITHCOORD'
      );
      assert.ok(Array.isArray(members));

      const catania = members.find(m => Array.isArray(m) && m[0] === 'Catania');
      assert.ok(catania);
      assert.strictEqual(catania[0], 'Catania');
      assert.ok(typeof catania[1] === 'string'); // distance
      assert.ok(Array.isArray(catania[2])); // coordinates
    });

    it('should respect COUNT limit', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'COUNT',
        1
      );
      assert.strictEqual(members.length, 1);
    });

    it('should respect ASC order', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'WITHDIST',
        'ASC'
      );
      assert.ok(Array.isArray(members));

      if (members.length >= 2) {
        const dist1 = parseFloat(members[0][1]);
        const dist2 = parseFloat(members[1][1]);
        assert.ok(dist1 <= dist2);
      }
    });

    it('should respect DESC order', async () => {
      const members = await client.georadius(
        testKey,
        15,
        37,
        200,
        'km',
        'WITHDIST',
        'DESC'
      );
      assert.ok(Array.isArray(members));

      if (members.length >= 2) {
        const dist1 = parseFloat(members[0][1]);
        const dist2 = parseFloat(members[1][1]);
        assert.ok(dist1 >= dist2);
      }
    });

    it('should store results', async () => {
      const storeKey = 'test:geo:results';
      await client.georadius(testKey, 15, 37, 200, 'km', 'STORE', storeKey);

      const stored = await client.zrange(storeKey, 0, -1);
      assert.ok(Array.isArray(stored));
      assert.ok(stored.length > 0);
    });

    it('should store distances', async () => {
      const storeKey = 'test:geo:distances';
      await client.georadius(testKey, 15, 37, 200, 'km', 'STOREDIST', storeKey);

      const stored = await client.zrange(storeKey, 0, -1, 'WITHSCORES');
      assert.ok(Array.isArray(stored));
      assert.ok(stored.length > 0);
    });
  });

  describe('GEORADIUSBYMEMBER', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania',
        13.583333,
        37.316667,
        'Agrigento'
      );
    });

    it('should find members within radius of member', async () => {
      const members = await client.georadiusbymember(
        testKey,
        'Agrigento',
        100,
        'km'
      );
      assert.ok(Array.isArray(members));
      assert.ok(members.includes('Agrigento'));
      assert.ok(members.includes('Palermo'));
    });

    it('should return with coordinates', async () => {
      const members = await client.georadiusbymember(
        testKey,
        'Agrigento',
        100,
        'km',
        'WITHCOORD'
      );
      assert.ok(Array.isArray(members));

      const palermo = members.find(m => Array.isArray(m) && m[0] === 'Palermo');
      assert.ok(palermo);
      assert.ok(Array.isArray(palermo[1]));
    });

    it('should return with distance', async () => {
      const members = await client.georadiusbymember(
        testKey,
        'Agrigento',
        100,
        'km',
        'WITHDIST'
      );
      assert.ok(Array.isArray(members));

      const palermo = members.find(m => Array.isArray(m) && m[0] === 'Palermo');
      assert.ok(palermo);
      assert.ok(typeof palermo[1] === 'string');
    });

    it('should respect COUNT limit', async () => {
      const members = await client.georadiusbymember(
        testKey,
        'Agrigento',
        100,
        'km',
        'COUNT',
        2
      );
      assert.ok(members.length <= 2);
    });

    it('should handle non-existent member', async () => {
      try {
        await client.georadiusbymember(testKey, 'NonExistent', 100, 'km');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  describe('GEOHASH', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania'
      );
    });

    it('should return geohash for single member', async () => {
      const hashes = await client.geohash(testKey, 'Palermo');
      assert.ok(Array.isArray(hashes));
      assert.strictEqual(hashes.length, 1);
      assert.ok(typeof hashes[0] === 'string');
      assert.ok(hashes[0].startsWith('sqc')); // Palermo's geohash prefix
    });

    it('should return geohashes for multiple members', async () => {
      const hashes = await client.geohash(testKey, 'Palermo', 'Catania');
      assert.strictEqual(hashes.length, 2);
      assert.ok(typeof hashes[0] === 'string');
      assert.ok(typeof hashes[1] === 'string');
    });

    it('should return null for non-existent member', async () => {
      const hashes = await client.geohash(testKey, 'NonExistent');
      assert.strictEqual(hashes.length, 1);
      assert.strictEqual(hashes[0], null);
    });

    it('should handle mixed existing and non-existing members', async () => {
      const hashes = await client.geohash(
        testKey,
        'Palermo',
        'NonExistent',
        'Catania'
      );
      assert.strictEqual(hashes.length, 3);
      assert.ok(typeof hashes[0] === 'string');
      assert.strictEqual(hashes[1], null);
      assert.ok(typeof hashes[2] === 'string');
    });
  });

  describe('GEOSEARCH', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania',
        13.583333,
        37.316667,
        'Agrigento',
        12.5,
        37.5,
        'TestPoint'
      );
    });

    it('should search by coordinates and radius', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMLONLAT',
        15,
        37,
        'BYRADIUS',
        100,
        'km'
      );
      assert.ok(Array.isArray(members));
      assert.ok(members.includes('Catania'));
    });

    it('should search by member and radius', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        100,
        'km'
      );
      assert.ok(Array.isArray(members));
      assert.ok(members.includes('Agrigento'));
      assert.ok(members.includes('Palermo'));
    });

    it('should search by box', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMLONLAT',
        13.5,
        37.5,
        'BYBOX',
        200,
        100,
        'km'
      );
      assert.ok(Array.isArray(members));
      assert.ok(members.length > 0);
    });

    it('should return with distance', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        100,
        'km',
        'WITHDIST'
      );
      assert.ok(Array.isArray(members));

      const palermo = members.find(m => Array.isArray(m) && m[0] === 'Palermo');
      assert.ok(palermo);
      assert.ok(typeof palermo[1] === 'string');
    });

    it('should return with coordinates', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        100,
        'km',
        'WITHCOORD'
      );
      assert.ok(Array.isArray(members));

      const palermo = members.find(m => Array.isArray(m) && m[0] === 'Palermo');
      assert.ok(palermo);
      assert.ok(Array.isArray(palermo[1]));
      assert.strictEqual(palermo[1].length, 2);
    });

    it('should return with hash', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        100,
        'km',
        'WITHHASH'
      );
      assert.ok(Array.isArray(members));

      const palermo = members.find(m => Array.isArray(m) && m[0] === 'Palermo');
      assert.ok(palermo);
      assert.ok(typeof palermo[1] === 'string');
      assert.ok(palermo[1].length > 0);
    });

    it('should respect COUNT limit', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMLONLAT',
        13.5,
        37.5,
        'BYRADIUS',
        500,
        'km',
        'COUNT',
        2
      );
      assert.ok(members.length <= 2);
    });

    it('should respect ASC order', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        200,
        'km',
        'WITHDIST',
        'ASC'
      );
      assert.ok(Array.isArray(members));

      if (members.length >= 2) {
        const dist1 = parseFloat(members[0][1]);
        const dist2 = parseFloat(members[1][1]);
        assert.ok(dist1 <= dist2);
      }
    });

    it('should respect DESC order', async () => {
      const members = await client.geosearch(
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        200,
        'km',
        'WITHDIST',
        'DESC'
      );
      assert.ok(Array.isArray(members));

      if (members.length >= 2) {
        const dist1 = parseFloat(members[0][1]);
        const dist2 = parseFloat(members[1][1]);
        assert.ok(dist1 >= dist2);
      }
    });
  });

  describe('GEOSEARCHSTORE', () => {
    beforeEach(async () => {
      await client.geoadd(
        testKey,
        13.361389,
        38.115556,
        'Palermo',
        15.087269,
        37.502669,
        'Catania',
        13.583333,
        37.316667,
        'Agrigento'
      );
    });

    it('should store search results', async () => {
      const destKey = 'test:geo:search:results';
      const count = await client.geosearchstore(
        destKey,
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        100,
        'km'
      );

      assert.ok(count > 0);

      const stored = await client.zrange(destKey, 0, -1);
      assert.ok(Array.isArray(stored));
      assert.ok(stored.includes('Palermo'));
      assert.ok(stored.includes('Agrigento'));
    });

    it('should store with distances', async () => {
      const destKey = 'test:geo:search:distances';
      const count = await client.geosearchstore(
        destKey,
        testKey,
        'FROMMEMBER',
        'Agrigento',
        'BYRADIUS',
        100,
        'km',
        'STOREDIST'
      );

      assert.ok(count > 0);

      const stored = await client.zrange(destKey, 0, -1, 'WITHSCORES');
      assert.ok(Array.isArray(stored));
      assert.ok(stored.length > 0);

      // Check that scores are stored (distances)
      for (let i = 1; i < stored.length; i += 2) {
        assert.ok(typeof stored[i] === 'string');
        const score = parseFloat(stored[i]);
        assert.ok(!isNaN(score));
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty key', async () => {
      const members = await client.georadius(testKey, 0, 0, 100, 'km');
      assert.deepStrictEqual(members, []);
    });

    it('should handle invalid coordinates', async () => {
      try {
        await client.geoadd(testKey, 181, 0, 'Invalid1'); // Longitude out of range
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
      }

      try {
        await client.geoadd(testKey, 0, 91, 'Invalid2'); // Latitude out of range
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err);
      }
    });

    it('should handle zero radius', async () => {
      await client.geoadd(testKey, 0, 0, 'Origin');
      const members = await client.georadius(testKey, 0, 0, 0, 'km');
      assert.ok(Array.isArray(members));
      // Zero radius returns no results (doesn't include center point)
      assert.strictEqual(members.length, 0);
    });

    it('should handle very large radius', async () => {
      await client.geoadd(
        testKey,
        -122.4194,
        37.7749,
        'SanFrancisco',
        139.6917,
        35.6895,
        'Tokyo'
      );

      const members = await client.georadius(testKey, 0, 0, 50000, 'km'); // Larger than Earth's circumference
      assert.ok(Array.isArray(members));
      assert.strictEqual(members.length, 2);
    });
  });
});
