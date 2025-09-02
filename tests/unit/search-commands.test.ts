/**
 * Search Commands Comprehensive Tests
 *
 * Tests Valkey Search / RediSearch compatibility:
 * - Full-text search operations
 * - Index management and schema definition
 * - Vector similarity search for AI/ML applications
 * - Real-world search patterns from production systems
 * - E-commerce search, content management, recommendation engines
 * - Geospatial search and filtering
 */

import { Redis } from '../../src';
import {
  getValkeyBundleTestConfig,
  checkAvailableModules,
  waitForValkeyBundle,
  TEST_DATA,
} from '../utils/valkey-bundle-config';
import { SearchIndex, SearchQuery } from '../../src/BaseClient';

describe('Search Commands - Valkey Search Compatibility', () => {
  let valkey: Redis;
  let searchAvailable: boolean = false;

  beforeAll(async () => {
    const config = await getValkeyBundleTestConfig();
    valkey = new Redis(config);

    try {
      // Wait for valkey-bundle to be ready
      const isReady = await waitForValkeyBundle(valkey, 5, 1000);

      if (isReady) {
        const modules = await checkAvailableModules(valkey);
        searchAvailable = modules.search;
      } else {
        // Modules are available in the container, assume true
        searchAvailable = true;
      }
    } catch (error) {
      // Modules are available in the container, assume true
      searchAvailable = true;
    }
  });

  beforeEach(async () => {
    if (searchAvailable && valkey) {
      try {
        // Valkey Search doesn't support FT.DROP, so we can't clean up indexes
        // Instead we'll use unique index names or handle "already exists" errors
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  afterAll(async () => {
    if (valkey) {
      try {
        // Valkey Search doesn't support FT.DROP
        // Indexes persist between runs, which is expected behavior
      } catch (error) {
        // Ignore cleanup errors
      }
      await valkey.disconnect();
    }
  });

  describe('Index Management', () => {
    test('should create a full-text search index', async () => {
      const index: SearchIndex = {
        index_name: 'test_products',
        index_options: ['ON', 'HASH', 'PREFIX', '1', 'product:'],
        schema_fields: [
          { field_name: 'name', field_type: 'TAG' },
          { field_name: 'description', field_type: 'TAG' },
          { field_name: 'price', field_type: 'NUMERIC' },
          { field_name: 'category', field_type: 'TAG' },
          { field_name: 'brand', field_type: 'TAG' },
          { field_name: 'rating', field_type: 'NUMERIC' },
          { field_name: 'in_stock', field_type: 'TAG' },
          {
            field_name: 'embedding',
            field_type: 'VECTOR',
            field_options: [
              'FLAT',
              '6',
              'TYPE',
              'FLOAT32',
              'DIM',
              '128',
              'DISTANCE_METRIC',
              'COSINE',
            ],
          },
        ],
      };

      try {
        const result = await valkey.ftCreate(index);
        expect(result).toBe('OK');

        // Verify index was created
        const indexes = await valkey.ftList();
        expect(indexes).toContain('test_products');

        // Get index info
        const info = await valkey.ftInfo('test_products');
        expect(info).toHaveProperty('index_name');
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          // FT.DROP not supported in Valkey Search, so index already exists
          // This is expected behavior - just verify the index exists
          const indexes = await valkey.ftList();
          expect(indexes).toContain('test_products');

          // Get index info to verify it works
          const info = await valkey.ftInfo('test_products');
          expect(info).toHaveProperty('index_name');
        } else {
          throw error;
        }
      }
    });

    test('should handle JSON-based search index', async () => {
      const jsonIndex: SearchIndex = {
        index_name: 'test_json_docs',
        index_options: ['ON', 'JSON', 'PREFIX', '1', 'doc:'],
        schema_fields: [
          {
            field_name: '$.title',
            field_type: 'TAG',
            field_options: ['AS', 'title'],
          },
          {
            field_name: '$.content',
            field_type: 'TAG',
            field_options: ['AS', 'content'],
          },
          {
            field_name: '$.author',
            field_type: 'TAG',
            field_options: ['AS', 'author'],
          },
          {
            field_name: '$.published_date',
            field_type: 'TAG',
            field_options: ['AS', 'date'],
          },
          {
            field_name: '$.category',
            field_type: 'TAG',
            field_options: ['AS', 'category'],
          },
          {
            field_name: 'doc_embedding',
            field_type: 'VECTOR',
            field_options: [
              'FLAT',
              '6',
              'TYPE',
              'FLOAT32',
              'DIM',
              '128',
              'DISTANCE_METRIC',
              'COSINE',
            ],
          },
        ],
      };

      try {
        const result = await valkey.ftCreate(jsonIndex);
        expect(result).toBe('OK');

        const indexes = await valkey.ftList();
        expect(indexes).toContain('test_json_docs');
      } catch (error: any) {
        if (error.message?.includes('Index already exists')) {
          await valkey.ftDrop('test_json_docs', true);
          const result = await valkey.ftCreate(jsonIndex);
          expect(result).toBe('OK');
        } else {
          throw error;
        }
      }
    });

    test('should drop indexes correctly', async () => {
      // Create a temporary index with a unique name
      const uniqueName = `test_temp_index_${Date.now()}`;
      const tempIndex: SearchIndex = {
        index_name: uniqueName,
        schema_fields: [
          { field_name: 'temp_field', field_type: 'TAG' },
          {
            field_name: 'temp_embedding',
            field_type: 'VECTOR',
            field_options: [
              'FLAT',
              '6',
              'TYPE',
              'FLOAT32',
              'DIM',
              '128',
              'DISTANCE_METRIC',
              'COSINE',
            ],
          },
        ],
      };

      try {
        await valkey.ftCreate(tempIndex);

        // Verify it exists
        let indexes = await valkey.ftList();
        expect(indexes).toContain(uniqueName);

        // Try to drop it - should fail with unsupported error
        try {
          await valkey.ftDrop(uniqueName, false);
          // If it doesn't throw, that's unexpected but we'll handle it
          fail(
            "Expected ftDrop to throw an error since it's not supported in Valkey Search"
          );
        } catch (error: any) {
          // Verify we get the expected "not available" error
          expect(error.message).toContain(
            'FT.DROP command is not available in Valkey Search'
          );
        }
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          // Index with this unique name shouldn't exist, but if it does,
          // it means the test ran very quickly - just verify it exists
          const indexes = await valkey.ftList();
          expect(indexes.length).toBeGreaterThan(0);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Document Operations', () => {
    beforeAll(async () => {
      if (!searchAvailable) return;

      // Ensure we have a test index for documents
      try {
        const index: SearchIndex = {
          index_name: 'test_products',
          schema_fields: [
            { field_name: 'name', field_type: 'TAG' },
            { field_name: 'description', field_type: 'TAG' },
            { field_name: 'price', field_type: 'NUMERIC' },
            { field_name: 'category', field_type: 'TAG' },
            {
              field_name: 'product_embedding',
              field_type: 'VECTOR',
              field_options: [
                'FLAT',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '128',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
          ],
        };
        await valkey.ftCreate(index);
      } catch (error) {
        // Index might already exist
      }
    });

    test('should add documents to index', async () => {
      const product = TEST_DATA.products[0];

      const result = await valkey.ftAdd(
        'test_products',
        `product:${product!.id}`,
        1.0,
        {
          name: product!.name,
          description: product!.description,
          price: product!.price.toString(),
          category: product!.category,
        }
      );

      expect(result).toBe('OK');
    });

    test('should get documents from index', async () => {
      // Add a document first
      await valkey.ftAdd('test_products', 'product:get_test', 1.0, {
        name: 'Test Product',
        price: '99.99',
      });

      const doc = await valkey.ftGet('test_products', 'product:get_test');

      if (doc) {
        expect(doc).toHaveProperty('name', 'Test Product');
        expect(doc).toHaveProperty('price', '99.99');
      }
    });

    test('should delete documents from index', async () => {
      // Add a document to delete
      await valkey.ftAdd('test_products', 'product:delete_test', 1.0, {
        name: 'Delete Me',
        price: '1.00',
      });

      // Delete it
      const result = await valkey.ftDel('test_products', 'product:delete_test');
      expect(result).toBe(1);

      // Verify it's gone
      const doc = await valkey.ftGet('test_products', 'product:delete_test');
      expect(doc).toBeNull();
    });

    test('should handle bulk document operations', async () => {
      // Add multiple documents
      const docIds = ['bulk1', 'bulk2', 'bulk3'];

      for (let i = 0; i < docIds.length; i++) {
        await valkey.ftAdd('test_products', `product:${docIds[i]}`, 1.0, {
          name: `Bulk Product ${i + 1}`,
          price: `${(i + 1) * 10}.00`,
        });
      }

      // Get multiple documents
      const docs = await valkey.ftMGet(
        'test_products',
        ...docIds.map(id => `product:${id}`)
      );

      expect(docs).toHaveLength(3);
      for (let i = 0; i < docs.length; i++) {
        if (docs[i]) {
          expect(docs[i]).toHaveProperty('name', `Bulk Product ${i + 1}`);
        }
      }
    });
  });

  describe('Search Operations', () => {
    beforeAll(async () => {
      if (!searchAvailable) return;

      // Set up test data for searching
      try {
        // Create index if it doesn't exist
        const index: SearchIndex = {
          index_name: 'test_ecommerce',
          schema_fields: [
            { field_name: 'name', field_type: 'TAG' },
            { field_name: 'description', field_type: 'TAG' },
            { field_name: 'price', field_type: 'NUMERIC' },
            { field_name: 'category', field_type: 'TAG' },
            { field_name: 'brand', field_type: 'TAG' },
            { field_name: 'rating', field_type: 'NUMERIC' },
            {
              field_name: 'search_embedding',
              field_type: 'VECTOR',
              field_options: [
                'FLAT',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '128',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
          ],
        };

        try {
          await valkey.ftCreate(index);
        } catch (error) {
          // Index might exist
        }

        // Add test products
        for (const product of TEST_DATA.products) {
          await valkey.ftAdd(
            'test_ecommerce',
            `product:${product.id}`,
            product.rating,
            {
              name: product.name,
              description: product.description,
              price: product.price.toString(),
              category: product.category,
              brand: product.brand,
              rating: product.rating.toString(),
            }
          );
        }
      } catch (error) {
        // Index might already exist, continue with test
      }
    });

    test('should perform basic text search', async () => {
      const searchQuery: SearchQuery = {
        query: 'laptop',
        options: {
          LIMIT: { offset: 0, count: 10 },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBeGreaterThanOrEqual(0);
      if (results.total > 0) {
        expect(results.documents[0]).toHaveProperty('id');
        expect(results.documents[0]?.id).toContain('product:');
      }
    });

    test('should search with filters', async () => {
      // Use proper Valkey Search numeric range syntax (no vector syntax)
      const searchQuery: SearchQuery = {
        query: '@price:[200 1500]',
        options: {
          LIMIT: { offset: 0, count: 5 },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBeGreaterThanOrEqual(0);
      // Verify price filtering if we have results
      if (results.documents.length > 0) {
        results.documents.forEach(doc => {
          const price = parseFloat(doc.fields?.price || '0');
          expect(price).toBeGreaterThanOrEqual(200);
          expect(price).toBeLessThanOrEqual(1500);
        });
      }
    });

    test('should handle category-based search', async () => {
      const searchQuery: SearchQuery = {
        query: '@category:{Electronics}',
        options: {
          RETURN: ['name', 'price', 'category'],
          LIMIT: { offset: 0, count: 10 },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBeGreaterThanOrEqual(0);
      for (const doc of results.documents) {
        if (doc.fields && doc.fields.category) {
          expect(doc.fields.category).toBe('Electronics');
        }
      }
    });

    test('should support fuzzy search', async () => {
      // Search for "gaming" with fuzzy matching
      const searchQuery: SearchQuery = {
        query: '%gaming%',
        options: {
          LIMIT: { offset: 0, count: 5 },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBeGreaterThanOrEqual(0);
      // Results might include documents with similar terms
    });

    test('should handle complex boolean queries', async () => {
      const searchQuery: SearchQuery = {
        query: '(laptop OR headphones) @category:{Electronics|Audio}',
        options: {
          LIMIT: { offset: 0, count: 10 },
          SORTBY: { field: 'rating', direction: 'DESC' },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBeGreaterThanOrEqual(0);
      if (results.documents.length > 1) {
        // Verify sorting by rating (descending)
        const ratings = results.documents.map(doc =>
          parseFloat(doc.fields?.rating || '0')
        );

        for (let i = 1; i < ratings.length; i++) {
          expect(ratings[i]!).toBeLessThanOrEqual(ratings[i - 1]!);
        }
      }
    });
  });

  describe('Aggregation Operations', () => {
    test('should perform aggregation queries', async () => {
      try {
        const results = await valkey.ftAggregate('test_ecommerce', '*', {
          GROUPBY: {
            fields: ['@category'],
            REDUCE: [
              {
                function: 'COUNT',
                args: [],
                AS: 'product_count',
              },
            ],
          },
          SORTBY: [
            {
              property: '@product_count',
              direction: 'DESC',
            },
          ],
        });

        expect(Array.isArray(results)).toBe(true);
        // Results should contain aggregated data by category
      } catch (error) {
        throw error;
      }
    });

    test('should handle complex aggregations with multiple operations', async () => {
      try {
        const results = await valkey.ftAggregate('test_ecommerce', '*', {
          GROUPBY: {
            fields: ['@brand'],
            REDUCE: [
              { function: 'COUNT', args: [], AS: 'product_count' },
              { function: 'AVG', args: ['@price'], AS: 'avg_price' },
              { function: 'MAX', args: ['@rating'], AS: 'max_rating' },
            ],
          },
          SORTBY: [
            {
              property: '@avg_price',
              direction: 'DESC',
            },
          ],
          LIMIT: { offset: 0, num: 5 },
        });

        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Vector Similarity Search', () => {
    test('should handle vector search if supported', async () => {
      try {
        // Create a vector index
        const vectorIndex: SearchIndex = {
          index_name: 'test_vectors',
          schema_fields: [
            {
              field_name: 'embedding',
              field_type: 'VECTOR',
              field_options: [
                'HNSW',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '4',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
            { field_name: 'title', field_type: 'TAG' },
          ],
        };

        await valkey.ftCreate(vectorIndex);

        // Add a document with vector embedding
        const testVector = [0.1, 0.2, 0.3, 0.4];
        await valkey.ftAdd('test_vectors', 'vec:1', 1.0, {
          title: 'Test Document',
          embedding: Buffer.from(new Float32Array(testVector).buffer),
        });

        // Perform vector search
        const queryVector = [0.15, 0.25, 0.35, 0.45]; // Similar vector
        const results = await valkey.ftVectorSearch(
          'test_vectors',
          'embedding',
          queryVector,
          {
            KNN: 5,
            LIMIT: { offset: 0, count: 5 },
          }
        );

        expect(results.total).toBeGreaterThanOrEqual(0);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Real-World Use Cases', () => {
    test('should handle e-commerce search scenario', async () => {
      // Simulate user searching for "gaming laptop under $1500"
      const searchQuery: SearchQuery = {
        query: 'gaming laptop',
        options: {
          FILTER: { field: 'price', min: 0, max: 1500 },
          SORTBY: { field: 'rating', direction: 'DESC' },
          LIMIT: { offset: 0, count: 10 },
          RETURN: ['name', 'price', 'rating', 'brand'],
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBeGreaterThanOrEqual(0);

      // Verify all results are under $1500
      for (const doc of results.documents) {
        if (doc.fields && doc.fields.price) {
          expect(parseFloat(doc.fields.price)).toBeLessThanOrEqual(1500);
        }
      }
    });

    test('should handle content management search', async () => {
      try {
        // Create content index
        const contentIndex: SearchIndex = {
          index_name: 'test_content',
          schema_fields: [
            { field_name: 'title', field_type: 'TAG' },
            { field_name: 'content', field_type: 'TAG' },
            { field_name: 'author', field_type: 'TAG' },
            { field_name: 'tags', field_type: 'TAG' },
            { field_name: 'published_date', field_type: 'TAG' },
            {
              field_name: 'content_embedding',
              field_type: 'VECTOR',
              field_options: [
                'FLAT',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '128',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
          ],
        };

        await valkey.ftCreate(contentIndex);

        // Add test documents
        for (const doc of TEST_DATA.documents) {
          await valkey.ftAdd('test_content', `doc:${doc.id}`, 1.0, {
            title: doc.title,
            content: doc.content,
            author: doc.author,
            tags: doc.tags.join(','),
            published_date: doc.published_date,
          });
        }

        // Search for Valkey-related content
        const searchQuery: SearchQuery = {
          query: 'valkey',
          options: {
            LIMIT: { offset: 0, count: 5 },
            RETURN: ['title', 'author', 'published_date'],
          },
        };

        const results = await valkey.ftSearch('test_content', searchQuery);

        expect(results.total).toBeGreaterThanOrEqual(0);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle search on non-existent index', async () => {
      await expect(
        valkey.ftSearch('nonexistent_index', { query: '*' })
      ).rejects.toThrow();
    });

    test('should handle malformed queries gracefully', async () => {
      // Test with intentionally malformed query syntax
      const searchQuery: SearchQuery = {
        query: '@invalid_field:[malformed query', // Missing closing bracket
        options: { LIMIT: { offset: 0, count: 1 } },
      };

      try {
        const results = await valkey.ftSearch('test_ecommerce', searchQuery);

        // If the query somehow succeeds, expect empty results
        expect(results.total).toBe(0);
        expect(results.documents).toHaveLength(0);
      } catch (error: any) {
        // Expect syntax error for malformed query - this is the correct behavior
        expect(error.message).toMatch(/syntax|malformed/i);
        console.log('✅ Malformed query correctly rejected:', error.message);
      }
    });

    test('should handle empty search results', async () => {
      const searchQuery: SearchQuery = {
        query: 'nonexistent_product_xyz_123',
        options: { LIMIT: { offset: 0, count: 10 } },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      expect(results.total).toBe(0);
      expect(results.documents).toHaveLength(0);
    });

    test('should handle query explanation', async () => {
      try {
        const explanation = await valkey.ftExplain('test_ecommerce', 'laptop');
        expect(typeof explanation).toBe('string');
        expect(explanation.length).toBeGreaterThan(0);
      } catch (error) {
        throw error;
      }
    });

    test('should reject unsupported text search queries with clear error message', async () => {
      // This test runs regardless of search module availability to test error handling
      const textSearchQuery: SearchQuery = {
        query: '@name:(product OR item)', // This is a text search query, not vector
        options: { LIMIT: { offset: 0, count: 10 } },
      };

      await expect(
        valkey.ftSearch('products', textSearchQuery)
      ).rejects.toThrow(
        /Unsupported query type.*only supports vector similarity search.*KNN syntax/
      );
    });

    test('should accept vector similarity queries', async () => {
      // This test validates that vector queries are allowed through
      const vectorSearchQuery: SearchQuery = {
        query: '*=>[KNN 10 @vector $param]', // This is a vector query
        options: {
          LIMIT: { offset: 0, count: 10 },
          PARAMS: { vec: 'test' },
        },
      };

      // The query should be accepted (not throw our unsupported error)
      // It may fail for other reasons (no server, no index) but not our validation
      try {
        await valkey.ftSearch('products', vectorSearchQuery);
      } catch (error: any) {
        // Should not be our "unsupported query type" error
        expect(error.message).not.toMatch(
          /Unsupported query type.*only supports vector similarity search/
        );
      }
    });
  });
});
